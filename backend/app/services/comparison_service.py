"""跨模型对比服务"""
import json
import uuid
from typing import Dict, List, Any, Optional

from app.core.database import prisma
from app.services.eval_engine import run_eval


async def create_comparison(
    name: str,
    mode: str,
    test_suite_id: str,
    template_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    agent_ids: Optional[List[str]] = None,
    model_overrides: Optional[List[str]] = None,
    repeat_count: int = 1,
    dimensions: List[str] = None,
    model_config_id: Optional[str] = None,
) -> Dict[str, Any]:
    """创建跨模型对比运行"""
    if dimensions is None:
        dimensions = ["accuracy", "completeness", "helpfulness"]

    comparison_id = str(uuid.uuid4())
    eval_run_ids = []
    model_labels = []

    if mode == "quick" and agent_id and model_overrides:
        # 快速模式：同一 Agent 切换模型
        agent = await prisma.agent.find_unique(where={"id": agent_id})
        if not agent:
            raise ValueError("Agent 不存在")

        for model_name in model_overrides:
            for r in range(repeat_count):
                run_name_suffix = f" (run {r+1})" if repeat_count > 1 else ""
                record = await _create_eval_run_for_comparison(
                    agent_id=agent_id,
                    test_suite_id=test_suite_id,
                    template_id=template_id,
                    model_override=model_name,
                    dimensions=dimensions,
                    model_config_id=model_config_id,
                )
                eval_run_ids.append(record.id)
            model_labels.append(model_name)

    elif mode == "free" and agent_ids:
        # 自由模式：多 Agent 对比
        for aid in agent_ids:
            agent = await prisma.agent.find_unique(where={"id": aid})
            if not agent:
                continue
            for r in range(repeat_count):
                record = await _create_eval_run_for_comparison(
                    agent_id=aid,
                    test_suite_id=test_suite_id,
                    template_id=template_id,
                    model_override=None,
                    dimensions=dimensions,
                    model_config_id=model_config_id,
                )
                eval_run_ids.append(record.id)
            model_labels.append(agent.name)
    else:
        raise ValueError("无效的对比模式或缺少必要参数")

    comparison = await prisma.comparisonrun.create(
        data={
            "id": comparison_id,
            "name": name,
            "mode": mode,
            "testSuiteId": test_suite_id,
            "templateId": template_id,
            "evalRunIds": json.dumps(eval_run_ids),
            "modelLabels": json.dumps(model_labels),
            "repeatCount": repeat_count,
            "status": "running",
        }
    )

    # 启动评测（各模型串行，避免并发限流）
    import asyncio
    asyncio.create_task(_run_comparison_tasks(comparison_id, eval_run_ids, model_labels, repeat_count))

    return {
        "id": comparison_id,
        "eval_run_ids": eval_run_ids,
        "model_labels": model_labels,
        "status": "running",
    }


async def _run_comparison_tasks(comparison_id: str, eval_run_ids: List[str], model_labels: List[str], repeat_count: int):
    """在后台依次运行各模型的评测任务，避免并发过高触发限流"""
    import asyncio
    for i, label in enumerate(model_labels):
        start_idx = i * repeat_count
        run_ids = eval_run_ids[start_idx:start_idx + repeat_count]
        # 同一模型的多次重复可以并发，但不同模型之间串行执行，减少 429 限流
        tasks = [run_eval(rid) for rid in run_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

    # 完成后聚合数据
    comparison_data = await _aggregate_comparison(comparison_id)
    await prisma.comparisonrun.update(
        where={"id": comparison_id},
        data={
            "status": "completed",
            "comparisonData": json.dumps(comparison_data),
        },
    )


async def _create_eval_run_for_comparison(
    agent_id: str,
    test_suite_id: str,
    template_id: Optional[str],
    model_override: Optional[str],
    dimensions: List[str],
    model_config_id: Optional[str],
):
    """为对比创建单个 EvalRun"""
    agent = await prisma.agent.find_unique(where={"id": agent_id})
    test_suite = await prisma.testsuite.find_unique(where={"id": test_suite_id})

    agent_snapshot = {
        "name": agent.name,
        "agent_type": agent.agentType,
        "agent_config": agent.agentConfig,
        "system_prompt": agent.systemPrompt,
        "skills": agent.skills,
    }
    test_cases = test_suite.testCases if test_suite.testCases else []
    test_suite_snapshot = {"name": test_suite.name, "test_cases": test_cases}
    total = len(test_cases) if isinstance(test_cases, list) else 0

    return await prisma.evalrun.create(
        data={
            "agentId": agent_id,
            "testSuiteId": test_suite_id,
            "modelConfigId": model_config_id,
            "agentSnapshot": json.dumps(agent_snapshot),
            "testSuiteSnapshot": json.dumps(test_suite_snapshot),
            "dimensions": json.dumps(dimensions),
            "templateId": template_id,
            "modelOverride": model_override,
            "totalItems": total,
        }
    )


async def _aggregate_comparison(comparison_id: str) -> Dict[str, Any]:
    """聚合对比数据"""
    comparison = await prisma.comparisonrun.find_unique(where={"id": comparison_id})
    if not comparison:
        return {}

    eval_run_ids = comparison.evalRunIds
    if isinstance(eval_run_ids, str):
        eval_run_ids = json.loads(eval_run_ids)

    model_labels = comparison.modelLabels
    if isinstance(model_labels, str):
        model_labels = json.loads(model_labels)

    repeat_count = comparison.repeatCount or 1
    results_per_model = {}

    for i, label in enumerate(model_labels):
        start_idx = i * repeat_count
        run_ids = eval_run_ids[start_idx:start_idx + repeat_count]

        all_results = []
        for rid in run_ids:
            results = await prisma.evalresult.find_many(where={"evalRunId": rid})
            all_results.extend(results)

        runs = []
        for rid in run_ids:
            run = await prisma.evalrun.find_unique(where={"id": rid})
            if run:
                runs.append(run)

        # 聚合统计
        total_results = len(all_results)
        passed = sum(1 for r in all_results if r.passed)
        scores = [r.overallScore for r in all_results if r.overallScore is not None]
        latencies = [r.latencyMs for r in all_results if r.latencyMs is not None and r.latencyMs > 0]

        # 统计错误信息
        error_count = 0
        error_summary: Dict[str, int] = {}
        for r in all_results:
            if r.errorMessage:
                error_count += 1
                # 提取核心错误信息（去掉 URL 等细节）
                msg = r.errorMessage
                if "too many requests" in msg.lower() or "429" in msg:
                    key = "429 请求限流 (Too Many Requests)"
                elif "invalid request model" in msg.lower():
                    # 提取模型名
                    import re
                    m_match = re.search(r"invalid request model:\s*(.+?)\"?\}?$", msg)
                    key = f"不支持的模型: {m_match.group(1).strip() if m_match else '未知'}"
                elif "500" in msg:
                    key = f"服务端错误 (500)"
                else:
                    key = msg[:80]
                error_summary[key] = error_summary.get(key, 0) + 1

        dim_scores: Dict[str, List[float]] = {}
        for r in all_results:
            s = r.scores
            if isinstance(s, str):
                s = json.loads(s)
            if isinstance(s, dict):
                for dim, val in s.items():
                    if isinstance(val, (int, float)):
                        dim_scores.setdefault(dim, []).append(float(val))

        avg_dim = {d: round(sum(v)/len(v), 4) for d, v in dim_scores.items() if v}

        model_data: Dict[str, Any] = {
            "pass_rate": round(passed / max(total_results, 1), 4),
            "avg_score": round(sum(scores)/len(scores), 4) if scores else 0,
            "avg_latency_ms": round(sum(latencies)/len(latencies), 1) if latencies else 0,
            "dimension_scores": avg_dim,
            "total_results": total_results,
            "run_ids": run_ids,
            "score_variance": _variance(scores) if len(scores) > 1 else 0,
        }
        if error_count > 0:
            model_data["error_count"] = error_count
            model_data["error_summary"] = error_summary

        results_per_model[label] = model_data

    return {"models": results_per_model, "model_labels": model_labels}


def _variance(values: List[float]) -> float:
    if len(values) < 2:
        return 0
    mean = sum(values) / len(values)
    return round(sum((v - mean) ** 2 for v in values) / len(values), 6)
