"""评测引擎：异步并发执行评测运行，集成 ScoringEngine"""
import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from prisma import Json as PrismaJson
from app.core.database import prisma
from app.core.logging import get_logger
from app.adapters.factory import create_adapter
from app.services.scoring_engine import ScoringEngine, assertion_result_to_dict
from app.services.trajectory_judge import evaluate_trajectory
from app.services.trace_service import create_eval_trace
from app.services.tool_evaluator import evaluate_tool_calls_fine_grained
from app.services.failure_analysis import analyze_failure
from app.services.cost_calculator import calculate_eval_result_cost

logger = get_logger("eval_engine")


async def _update_progress_snapshot(
    progress_lock: asyncio.Lock,
    state: dict,
    total: int,
    passed: bool,
    score: float,
) -> dict:
    """锁内更新 state 并返回不可变快照，供锁外写 DB。

    三处竞态条件（单轮正常/单轮错误/多轮对话）统一复用此函数，
    消除进度读取与更新分处两个锁区间的问题。
    """
    async with progress_lock:
        if passed:
            state["passed"] += 1
        else:
            state["failed"] += 1
        state["scores"].append(score)
        state["completed"] += 1
        return {
            "completed": state["completed"],
            "passed": state["passed"],
            "failed": state["failed"],
            "progress": int(state["completed"] / total * 100),
        }


def _json_field(value) -> Any:
    """将 Python 对象包装为 Prisma Json 类型，None 则返回 None（可选字段不设置）"""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
    return PrismaJson(value)


def _json_field_required(value) -> Any:
    """必填 Json 字段，确保永远返回 PrismaJson"""
    if value is None:
        return PrismaJson({})
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
    return PrismaJson(value)


def _variance(values: List[float]) -> float:
    """计算方差"""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return round(sum((v - mean) ** 2 for v in values) / len(values), 6)


async def run_eval(eval_run_id: str):
    """执行一个评测运行（后台任务）"""
    logger.info("eval_run_started", eval_run_id=eval_run_id)

    run = await prisma.evalrun.find_unique(
        where={"id": eval_run_id},
        include={"agent": True, "testSuite": True, "modelConfig": True},
    )
    if not run:
        return

    await prisma.evalrun.update(
        where={"id": eval_run_id},
        data={"status": "running", "startedAt": datetime.now(timezone.utc)},
    )

    test_cases = run.testSuiteSnapshot
    if isinstance(test_cases, dict):
        test_cases = test_cases.get("test_cases", [])
    elif isinstance(test_cases, str):
        parsed = json.loads(test_cases)
        if isinstance(parsed, dict):
            test_cases = parsed.get("test_cases", [])
        else:
            test_cases = parsed

    if not test_cases:
        await prisma.evalrun.update(
            where={"id": eval_run_id},
            data={"status": "failed", "errorMessage": "测试套件为空"},
        )
        return

    agent_snapshot = run.agentSnapshot
    if isinstance(agent_snapshot, str):
        agent_snapshot = json.loads(agent_snapshot)

    agent_type = agent_snapshot.get("agent_type", "http")
    agent_config = agent_snapshot.get("agent_config", {})

    # 实验变量覆盖：将 experiment_combo 中的变量应用到 agent_config
    experiment_combo = agent_snapshot.get("experiment_combo", {})
    if experiment_combo:
        import copy
        agent_config = copy.deepcopy(agent_config) if agent_config else {}
        if "temperature" in experiment_combo:
            try:
                agent_config["temperature"] = float(experiment_combo["temperature"])
            except (ValueError, TypeError):
                pass
        if "prompt" in experiment_combo:
            agent_config["system_prompt"] = str(experiment_combo["prompt"])
        if "tool_config" in experiment_combo:
            agent_config["tool_config"] = experiment_combo["tool_config"]
        logger.info("experiment_combo_applied", combo=experiment_combo, eval_run_id=eval_run_id)

    try:
        adapter = create_adapter(agent_type, agent_config)
    except Exception as e:
        await prisma.evalrun.update(
            where={"id": eval_run_id},
            data={"status": "failed", "errorMessage": f"Agent 配置错误: {e}"},
        )
        return

    model_config_dict = None
    enable_multi_judge = False
    judge_count = 3
    if run.modelConfig:
        model_config_dict = {
            "base_url": run.modelConfig.baseUrl,
            "api_key": run.modelConfig.apiKey,
            "model": run.modelConfig.modelName,
            "temperature": run.modelConfig.temperature or 0,
        }
        enable_multi_judge = getattr(run.modelConfig, 'enableMultiJudge', False) or False
        judge_count = getattr(run.modelConfig, 'judgeCount', 3) or 3

    dimensions = run.dimensions
    if isinstance(dimensions, str):
        dimensions = json.loads(dimensions)

    enable_trajectory = run.enableTrajectoryEval
    trajectory_dims = run.trajectoryDimensions
    if isinstance(trajectory_dims, str):
        trajectory_dims = json.loads(trajectory_dims)
    if not trajectory_dims:
        trajectory_dims = None

    # 加载模板维度定义（如果指定了 templateId）
    dimension_defs = await _load_dimension_defs(run.templateId, dimensions)

    model_override = run.modelOverride or ""
    repeat_count = getattr(run, 'repeatCount', 1) or 1

    # 对比模式（有 modelOverride）默认低并发，避免 429 限流
    default_conc = 2 if model_override else 5
    concurrency = run.concurrency or default_conc

    total = len(test_cases)
    await prisma.evalrun.update(where={"id": eval_run_id}, data={"totalItems": total})

    # 并发控制
    semaphore = asyncio.Semaphore(concurrency)
    progress_lock = asyncio.Lock()
    state = {"passed": 0, "failed": 0, "completed": 0, "scores": [], "pass_at_k_data": []}

    scoring_engine = ScoringEngine()

    async def process_case(idx: int, tc: Dict):
        async with semaphore:
            await _process_single_case(
                idx=idx,
                tc=tc,
                eval_run_id=eval_run_id,
                adapter=adapter,
                scoring_engine=scoring_engine,
                model_config_dict=model_config_dict,
                dimensions=dimensions,
                dimension_defs=dimension_defs,
                enable_trajectory=enable_trajectory,
                trajectory_dims=trajectory_dims,
                agent_snapshot=agent_snapshot,
                model_override=model_override,
                total=total,
                state=state,
                progress_lock=progress_lock,
                repeat_count=repeat_count,
                enable_multi_judge=enable_multi_judge,
                judge_count=judge_count,
            )

    tasks = [process_case(idx, tc) for idx, tc in enumerate(test_cases)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 检查 gather 返回值中的异常（致命错误，如 DB 连接断开）
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(
                "eval_gather_task_exception",
                eval_run_id=eval_run_id,
                task_index=i,
                error=str(result),
                error_type=type(result).__name__,
            )

    try:
        avg_score = round(sum(state["scores"]) / len(state["scores"]), 4) if state["scores"] else 0

        # 聚合 Pass@K 数据
        pass_at_k_data = None
        if repeat_count > 1 and state["pass_at_k_data"]:
            pass_at_1_count = sum(1 for d in state["pass_at_k_data"] if d.get("pass_at_1", False))
            pass_at_k_count = sum(1 for d in state["pass_at_k_data"] if d.get("pass_at_k", False))
            pass_at_k_data = {
                "k": repeat_count,
                "pass_at_1": round(pass_at_1_count / len(state["pass_at_k_data"]), 4),
                "pass_at_k": round(pass_at_k_count / len(state["pass_at_k_data"]), 4),
                "total_cases": len(state["pass_at_k_data"]),
            }

        update_data = {
            "status": "completed",
            "progress": 100,
            "currentItem": total,
            "passedCount": state["passed"],
            "failedCount": state["failed"],
            "averageScore": avg_score,
            "completedAt": datetime.now(timezone.utc),
        }
        if pass_at_k_data:
            update_data["passAtK"] = _json_field(pass_at_k_data)

        await prisma.evalrun.update(where={"id": eval_run_id}, data=update_data)
        logger.info("eval_run_completed", eval_run_id=eval_run_id,
                     passed=state["passed"], failed=state["failed"], avg_score=avg_score)
    except Exception as e:
        logger.error("eval_run_finalize_failed", eval_run_id=eval_run_id, error=str(e))
        try:
            await prisma.evalrun.update(
                where={"id": eval_run_id},
                data={"status": "failed", "errorMessage": f"汇总阶段出错: {e}"},
            )
        except Exception as e:
            logger.error("eval_run_finalize_db_failed", eval_run_id=eval_run_id, error=str(e))


async def _process_single_case(
    idx: int,
    tc: Dict,
    eval_run_id: str,
    adapter,
    scoring_engine: ScoringEngine,
    model_config_dict: Optional[Dict],
    dimensions: List[str],
    dimension_defs: List[Dict],
    enable_trajectory: bool,
    trajectory_dims: Optional[List[str]],
    agent_snapshot: Dict,
    model_override: str,
    total: int,
    state: Dict,
    progress_lock: asyncio.Lock,
    repeat_count: int = 1,
    enable_multi_judge: bool = False,
    judge_count: int = 3,
):
    """处理单个测试用例（支持单轮和多轮对话）"""
    tc_id = tc.get("id", f"tc_{idx}")
    tc_input = tc.get("input", "")
    tc_expected = tc.get("expected_output", "")
    tc_assertions = tc.get("assertions", []) or []
    tc_sub_goals = tc.get("sub_goals", []) or []
    tc_expected_trajectory = tc.get("expected_trajectory", []) or []

    # 多轮对话支持
    tc_type = tc.get("type", "single")
    tc_turns = tc.get("turns", []) or []

    logger.info("eval_case_started", eval_run_id=eval_run_id, test_case_id=tc_id, case_type=tc_type)

    start_time = time.time()
    agent_output = ""
    agent_thinking = ""
    skills_called = []
    error_msg = None

    try:
        # ===================== 多轮对话评估 =====================
        if tc_type == "multi_turn" and tc_turns:
            await _process_multi_turn_case(
                tc_id=tc_id,
                tc_turns=tc_turns,
                tc_input=tc_input,
                eval_run_id=eval_run_id,
                adapter=adapter,
                scoring_engine=scoring_engine,
                model_config_dict=model_config_dict,
                dimensions=dimensions,
                dimension_defs=dimension_defs,
                agent_snapshot=agent_snapshot,
                model_override=model_override,
                total=total,
                state=state,
                progress_lock=progress_lock,
                start_time=start_time,
            )
            return

        # ===================== 单轮评估（原逻辑） =====================
        # --- Pass@K: 多次运行 ---
        repeat_results_data = None
        if repeat_count > 1:
            repeat_results = []
            for k in range(repeat_count):
                k_resp = await adapter.invoke(tc_input, model_override=model_override)
                if k_resp.error:
                    repeat_results.append({"passed": False, "score": 0, "error": k_resp.error})
                    continue
                k_output = k_resp.content or ""
                k_scoring = await scoring_engine.score(
                    agent_output=k_output,
                    expected_output=tc_expected,
                    question=tc_input,
                    assertions=tc_assertions,
                    dimensions=dimension_defs,
                    tool_calls=k_resp.tool_calls or None,
                    latency_ms=int((time.time() - start_time) * 1000),
                    token_usage=k_resp.token_usage,
                    judge_config=model_config_dict,
                    sub_goals=tc_sub_goals if tc_sub_goals else None,
                )
                repeat_results.append({
                    "passed": k_scoring.passed,
                    "score": k_scoring.overall_score,
                    "iteration": k,
                })

            # Aggregate pass@k
            scores_list = [r["score"] for r in repeat_results]
            all_passed = all(r["passed"] for r in repeat_results)
            first_passed = repeat_results[0]["passed"] if repeat_results else False
            consistency = (
                sum(1 for r in repeat_results if r["passed"] == repeat_results[0]["passed"])
                / len(repeat_results)
            ) if repeat_results else 0

            repeat_results_data = {
                "results": repeat_results,
                "pass_at_1": first_passed,
                "pass_at_k": all_passed,
                "variance": _variance(scores_list),
                "consistency": round(consistency, 4),
                "mean_score": round(sum(scores_list) / len(scores_list), 4) if scores_list else 0,
            }

            async with progress_lock:
                state["pass_at_k_data"].append({
                    "test_case_id": tc_id,
                    "pass_at_1": first_passed,
                    "pass_at_k": all_passed,
                })

        # --- Main run ---
        agent_resp = await adapter.invoke(tc_input, model_override=model_override)
        latency_ms = int((time.time() - start_time) * 1000)

        if agent_resp.error:
            error_msg = agent_resp.error
            async with progress_lock:
                state["failed"] += 1
                state["completed"] += 1
        else:
            agent_output = agent_resp.content or ""
            skills_called = agent_resp.tool_calls or []
            trajectory_data = [s.to_dict() for s in agent_resp.trajectory_steps] if agent_resp.trajectory_steps else []

            # 使用 ScoringEngine 统一评分
            scoring_result = await scoring_engine.score(
                agent_output=agent_output,
                expected_output=tc_expected,
                question=tc_input,
                assertions=tc_assertions,
                dimensions=dimension_defs,
                tool_calls=skills_called if skills_called else None,
                latency_ms=latency_ms,
                token_usage=agent_resp.token_usage,
                judge_config=model_config_dict,
                sub_goals=tc_sub_goals if tc_sub_goals else None,
            )

            scores = scoring_result.dimension_scores
            overall_score = scoring_result.overall_score
            reasoning = scoring_result.reasoning
            tc_passed = scoring_result.passed
            assertion_results_data = [assertion_result_to_dict(a) for a in scoring_result.assertion_results]

            # 轨迹评估 + Grounding Accuracy
            traj_scores_data = None
            traj_overall = None
            traj_reasoning = None
            grounding_accuracy = None
            if enable_trajectory and trajectory_data:
                try:
                    expected_tools = tc.get("metadata", {}).get("expected_tools") if tc.get("metadata") else None
                    traj_result = await evaluate_trajectory(
                        question=tc_input,
                        agent_output=agent_output,
                        trajectory_steps=trajectory_data,
                        expected_tools=expected_tools,
                        dimensions=trajectory_dims,
                        judge_config=model_config_dict,
                    )
                    traj_scores_data = traj_result.get("trajectory_scores", {})
                    if traj_result.get("programmatic_scores"):
                        traj_scores_data["_programmatic"] = traj_result["programmatic_scores"]
                    traj_overall = traj_result.get("trajectory_overall", 0)
                    traj_reasoning = traj_result.get("trajectory_reasoning", "")
                    grounding_accuracy = traj_result.get("grounding_accuracy")
                except Exception as traj_err:
                    logger.warning("trajectory_eval_failed", test_case_id=tc_id, error=str(traj_err))

            # 细粒度工具调用评估
            tool_eval_results = None
            if tc_expected_trajectory and trajectory_data:
                try:
                    tool_eval_results = evaluate_tool_calls_fine_grained(
                        actual_trajectory=trajectory_data,
                        expected_trajectory=tc_expected_trajectory,
                    )
                except Exception as te_err:
                    logger.warning("tool_eval_failed", test_case_id=tc_id, error=str(te_err))

            # 失败归因分析
            failure_analysis = None
            if not tc_passed and model_config_dict:
                try:
                    failure_analysis = await analyze_failure(
                        question=tc_input,
                        expected_output=tc_expected,
                        agent_output=agent_output,
                        error_message=error_msg or "",
                        assertion_results=assertion_results_data,
                        trajectory=trajectory_data,
                        scores=scores,
                        judge_config=model_config_dict,
                    )
                except Exception as fa_err:
                    logger.warning("failure_analysis_failed", test_case_id=tc_id, error=str(fa_err))

            # 成本计算
            cost_data = None
            try:
                agent_model = model_override or (agent_snapshot.get("agent_config", {}) or {}).get("model", "")
                judge_model = model_config_dict.get("model", "") if model_config_dict else ""
                cost_data = calculate_eval_result_cost(
                    agent_usage=agent_resp.token_usage,
                    agent_model=agent_model,
                    judge_model=judge_model,
                )
            except Exception as cost_err:
                logger.warning("cost_calculation_failed", test_case_id=tc_id, error=str(cost_err))

            # 创建 Trace 记录（评分完成后写入，含 scores）
            trace_info = await create_eval_trace(
                task_name=f"{agent_snapshot.get('name', 'agent')}-{eval_run_id[:8]}",
                agent_name=agent_snapshot.get("name", "unknown"),
                agent_id=agent_snapshot.get("id"),
                input_text=tc_input,
                output_text=agent_output,
                latency_ms=latency_ms,
                token_usage=agent_resp.token_usage,
                tool_calls=skills_called,
                scores=scores,
                overall_score=overall_score,
            )

            async with progress_lock:
                if tc_passed:
                    state["passed"] += 1
                else:
                    state["failed"] += 1
                state["scores"].append(overall_score)
                state["completed"] += 1
                # 锁内读取快照
                _snapshot = {
                    "completed": state["completed"],
                    "passed": state["passed"],
                    "failed": state["failed"],
                    "progress": int(state["completed"] / total * 100),
                }

            result_data = {
                    "evalRun": {"connect": {"id": eval_run_id}},
                    "testCaseId": tc_id,
                    "input": tc_input,
                    "expectedOutput": tc_expected,
                    "agentOutput": agent_output,
                    "agentThinking": agent_thinking,
                    "skillsCalled": _json_field(skills_called if skills_called else None),
                    "trajectory": _json_field(trajectory_data if trajectory_data else None),
                    "trajectoryScores": _json_field(traj_scores_data),
                    "trajectoryOverall": traj_overall,
                    "trajectoryReasoning": traj_reasoning,
                    "scores": _json_field_required(scores),
                    "overallScore": overall_score,
                    "passed": tc_passed,
                    "assertionResults": _json_field(assertion_results_data if assertion_results_data else None),
                    "criticalFailure": scoring_result.critical_failure,
                    "reasoning": reasoning,
                    "latencyMs": latency_ms,
                    "tokenUsage": _json_field(agent_resp.token_usage if agent_resp.token_usage else None),
                    # v4.0: 关联 Trace
                    "traceId": trace_info.get("trace_id") if trace_info.get("trace_id") else None,
                    # Phase 2+: 新增字段
                    "progressRate": scoring_result.progress_rate if scoring_result.progress_rate else None,
                    "subGoalResults": _json_field(scoring_result.sub_goal_results if scoring_result.sub_goal_results else None),
                    "groundingAccuracy": grounding_accuracy,
                    "toolEvalResults": _json_field(tool_eval_results),
                    "failureAnalysis": _json_field(failure_analysis),
                    "costData": _json_field(cost_data),
                    "repeatResults": _json_field(repeat_results_data),
                }
            # 移除值为 None 的可选字段，避免 Prisma 报 "value is required but not set"
            result_data = {k: v for k, v in result_data.items() if v is not None}
            await prisma.evalresult.create(data=result_data)

            logger.info("eval_case_completed", eval_run_id=eval_run_id, test_case_id=tc_id,
                         passed=tc_passed, score=overall_score)

            # 锁外用不可变快照写 DB（消除竞态条件）
            await prisma.evalrun.update(
                where={"id": eval_run_id},
                data={
                    "progress": _snapshot["progress"],
                    "currentItem": _snapshot["completed"],
                    "passedCount": _snapshot["passed"],
                    "failedCount": _snapshot["failed"],
                },
            )
            return

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        logger.error("eval_case_error", eval_run_id=eval_run_id, test_case_id=tc_id, error=error_msg)
        async with progress_lock:
            state["failed"] += 1
            state["completed"] += 1
            # 锁内读取快照
            _err_snapshot = {
                "completed": state["completed"],
                "passed": state["passed"],
                "failed": state["failed"],
                "progress": int(state["completed"] / total * 100),
            }

    # 错误路径
    try:
        error_result_data = {
            "evalRun": {"connect": {"id": eval_run_id}},
            "testCaseId": tc_id,
            "input": tc_input,
            "expectedOutput": tc_expected,
            "agentOutput": agent_output,
            "errorMessage": error_msg,
            "scores": _json_field_required({}),
            "overallScore": 0,
            "passed": False,
            "latencyMs": latency_ms,
        }
        error_result_data = {k: v for k, v in error_result_data.items() if v is not None}
        await prisma.evalresult.create(data=error_result_data)
    except Exception as db_err:
        logger.error("eval_result_save_failed", test_case_id=tc_id, error=str(db_err))

    try:
        # 锁外用不可变快照写 DB（消除竞态条件）
        await prisma.evalrun.update(
            where={"id": eval_run_id},
            data={
                "progress": _err_snapshot["progress"],
                "currentItem": _err_snapshot["completed"],
                "passedCount": _err_snapshot["passed"],
                "failedCount": _err_snapshot["failed"],
            },
        )
    except Exception as db_err:
        logger.error("eval_progress_update_failed", test_case_id=tc_id, error=str(db_err))


async def _load_dimension_defs(
    template_id: Optional[str],
    dimension_names: List[str],
) -> List[Dict]:
    """从数据库加载维度定义，如果指定了模板则用模板配置"""
    if template_id:
        template = await prisma.evaltemplate.find_unique(where={"id": template_id})
        if template:
            dim_config = template.dimensionConfig
            if isinstance(dim_config, str):
                dim_config = json.loads(dim_config)

            dim_ids = [dc.get("dimensionId") for dc in dim_config if dc.get("enabled", True)]
            weight_map = {dc.get("dimensionId"): dc.get("weight", 1.0) for dc in dim_config}

            if dim_ids:
                dims = await prisma.evaldimension.find_many(where={"id": {"in": dim_ids}})
                return [
                    {
                        "name": d.name,
                        "display_name": d.displayName,
                        "description": d.description,
                        "scoring_criteria": d.scoringCriteria,
                        "evaluation_steps": d.evaluationSteps,
                        "weight": weight_map.get(d.id, d.weight),
                        "scoring_method": d.scoringMethod,
                    }
                    for d in dims
                ]

    # Fallback: 从维度名查数据库
    if dimension_names:
        dims = await prisma.evaldimension.find_many(
            where={"name": {"in": dimension_names}}
        )
        if dims:
            return [
                {
                    "name": d.name,
                    "display_name": d.displayName,
                    "description": d.description,
                    "scoring_criteria": d.scoringCriteria,
                    "evaluation_steps": d.evaluationSteps,
                    "weight": d.weight,
                    "scoring_method": d.scoringMethod,
                }
                for d in dims
            ]

    # 最终 Fallback: 使用维度名作为简单定义
    return [{"name": d, "display_name": d, "description": d, "weight": 1.0} for d in dimension_names]


async def _process_multi_turn_case(
    tc_id: str,
    tc_turns: List[Dict],
    tc_input: str,
    eval_run_id: str,
    adapter,
    scoring_engine: ScoringEngine,
    model_config_dict: Optional[Dict],
    dimensions: List[str],
    dimension_defs: List[Dict],
    agent_snapshot: Dict,
    model_override: str,
    total: int,
    state: Dict,
    progress_lock: asyncio.Lock,
    start_time: float,
):
    """处理多轮对话测试用例：逐轮调用 Agent，逐轮评分，最终聚合。"""
    conversation_history: List[Dict[str, str]] = []
    turn_results: List[Dict[str, Any]] = []
    all_turn_scores: List[float] = []
    all_passed = True
    total_tokens_agg: Dict[str, int] = {}
    combined_output_parts: List[str] = []
    conversation_id = f"{eval_run_id}_{tc_id}"

    for turn_idx, turn in enumerate(tc_turns):
        user_message = turn.get("user_message", "")
        expected_response = turn.get("expected_response", "")
        turn_assertions = turn.get("assertions", []) or []
        turn_sub_goals = turn.get("sub_goals", []) or []

        try:
            turn_resp = await adapter.invoke_with_history(
                message=user_message,
                history=conversation_history if conversation_history else None,
                conversation_id=conversation_id,
                model_override=model_override,
            )

            turn_output = turn_resp.content or ""
            turn_latency = int((time.time() - start_time) * 1000)

            # 累积对话历史
            conversation_history.append({"role": "user", "content": user_message})
            conversation_history.append({"role": "assistant", "content": turn_output})
            combined_output_parts.append(f"[Turn {turn_idx + 1}] {turn_output}")

            # 累积 token 用量
            if turn_resp.token_usage:
                for k, v in turn_resp.token_usage.items():
                    total_tokens_agg[k] = total_tokens_agg.get(k, 0) + v

            if turn_resp.error:
                turn_results.append({
                    "turn_index": turn_idx,
                    "user_message": user_message,
                    "agent_output": "",
                    "error": turn_resp.error,
                    "score": 0,
                    "passed": False,
                })
                all_passed = False
                all_turn_scores.append(0)
                continue

            # 逐轮评分
            turn_scoring = await scoring_engine.score(
                agent_output=turn_output,
                expected_output=expected_response,
                question=user_message,
                assertions=turn_assertions,
                dimensions=dimension_defs,
                tool_calls=turn_resp.tool_calls or None,
                latency_ms=turn_latency,
                token_usage=turn_resp.token_usage,
                judge_config=model_config_dict,
                sub_goals=turn_sub_goals if turn_sub_goals else None,
            )

            turn_result = {
                "turn_index": turn_idx,
                "user_message": user_message,
                "expected_response": expected_response,
                "agent_output": turn_output,
                "score": turn_scoring.overall_score,
                "passed": turn_scoring.passed,
                "dimension_scores": turn_scoring.dimension_scores,
                "reasoning": turn_scoring.reasoning,
                "assertion_results": [
                    assertion_result_to_dict(a) for a in turn_scoring.assertion_results
                ] if turn_scoring.assertion_results else [],
            }
            turn_results.append(turn_result)
            all_turn_scores.append(turn_scoring.overall_score)
            if not turn_scoring.passed:
                all_passed = False

        except Exception as turn_err:
            logger.warning("multi_turn_step_failed", tc_id=tc_id, turn=turn_idx, error=str(turn_err))
            turn_results.append({
                "turn_index": turn_idx,
                "user_message": user_message,
                "agent_output": "",
                "error": str(turn_err),
                "score": 0,
                "passed": False,
            })
            all_passed = False
            all_turn_scores.append(0)

    # 聚合多轮结果
    overall_score = round(sum(all_turn_scores) / len(all_turn_scores), 4) if all_turn_scores else 0
    latency_ms = int((time.time() - start_time) * 1000)
    combined_output = "\n\n".join(combined_output_parts)
    # 使用首轮 input 或 tc_input 作为整体 input
    overall_input = tc_input or (tc_turns[0].get("user_message", "") if tc_turns else "")

    # 聚合维度分数（对各轮相同维度取平均）
    agg_dim_scores: Dict[str, float] = {}
    dim_counts: Dict[str, int] = {}
    for tr in turn_results:
        ds = tr.get("dimension_scores", {})
        if isinstance(ds, dict):
            for dim_name, dim_score in ds.items():
                if isinstance(dim_score, (int, float)):
                    agg_dim_scores[dim_name] = agg_dim_scores.get(dim_name, 0) + dim_score
                    dim_counts[dim_name] = dim_counts.get(dim_name, 0) + 1
    for dim_name in agg_dim_scores:
        if dim_counts.get(dim_name, 0) > 0:
            agg_dim_scores[dim_name] = round(agg_dim_scores[dim_name] / dim_counts[dim_name], 4)

    # 创建 Trace 记录
    trace_info = await create_eval_trace(
        task_name=f"{agent_snapshot.get('name', 'agent')}-{eval_run_id[:8]}-multiturn",
        agent_name=agent_snapshot.get("name", "unknown"),
        agent_id=agent_snapshot.get("id"),
        input_text=overall_input,
        output_text=combined_output,
        latency_ms=latency_ms,
        token_usage=total_tokens_agg if total_tokens_agg else None,
        tool_calls=None,
        scores=agg_dim_scores,
        overall_score=overall_score,
    )

    # 更新全局进度
    async with progress_lock:
        if all_passed:
            state["passed"] += 1
        else:
            state["failed"] += 1
        state["scores"].append(overall_score)
        state["completed"] += 1
        # 锁内读取快照
        _mt_snapshot = {
            "completed": state["completed"],
            "passed": state["passed"],
            "failed": state["failed"],
            "progress": int(state["completed"] / total * 100),
        }

    # 多轮结果详情存入 EvalResult
    multi_turn_data = {
        "type": "multi_turn",
        "total_turns": len(tc_turns),
        "completed_turns": len(turn_results),
        "turn_results": turn_results,
        "conversation_history": conversation_history,
    }

    result_data = {
        "evalRun": {"connect": {"id": eval_run_id}},
        "testCaseId": tc_id,
        "input": overall_input,
        "expectedOutput": tc_turns[-1].get("expected_response", "") if tc_turns else "",
        "agentOutput": combined_output,
        "scores": _json_field_required(agg_dim_scores),
        "overallScore": overall_score,
        "passed": all_passed,
        "reasoning": f"多轮对话评估 ({len(tc_turns)} 轮)，平均分: {overall_score}",
        "latencyMs": latency_ms,
        "tokenUsage": _json_field(total_tokens_agg if total_tokens_agg else None),
        "traceId": trace_info.get("trace_id") if trace_info.get("trace_id") else None,
        "repeatResults": _json_field(multi_turn_data),
    }

    result_data = {k: v for k, v in result_data.items() if v is not None}
    await prisma.evalresult.create(data=result_data)

    logger.info(
        "eval_multi_turn_completed",
        eval_run_id=eval_run_id,
        test_case_id=tc_id,
        turns=len(tc_turns),
        passed=all_passed,
        score=overall_score,
    )

    # 锁外用不可变快照写 DB（消除竞态条件）
    await prisma.evalrun.update(
        where={"id": eval_run_id},
        data={
            "progress": _mt_snapshot["progress"],
            "currentItem": _mt_snapshot["completed"],
            "passedCount": _mt_snapshot["passed"],
            "failedCount": _mt_snapshot["failed"],
        },
    )
