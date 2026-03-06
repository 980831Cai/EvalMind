"""评测运行 API"""
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.core.database import prisma
from app.models.pydantic_models import EvalRunCreate, EvalRunResponse, EvalResultResponse
from app.services.eval_engine import run_eval

router = APIRouter(prefix="/eval-runs", tags=["EvalRuns"])


def _to_run_response(record, include_results=False) -> EvalRunResponse:
    agent_name = ""
    test_suite_name = ""
    model_config_name = ""

    if hasattr(record, "agent") and record.agent:
        agent_name = record.agent.name
    if hasattr(record, "testSuite") and record.testSuite:
        test_suite_name = record.testSuite.name
    if hasattr(record, "modelConfig") and record.modelConfig:
        model_config_name = record.modelConfig.name

    results = None
    if include_results and hasattr(record, "results") and record.results:
        results = [_to_result_response(r) for r in record.results]

    return EvalRunResponse(
        id=record.id,
        agent_id=record.agentId,
        test_suite_id=record.testSuiteId,
        model_config_id=record.modelConfigId,
        agent_snapshot=record.agentSnapshot if record.agentSnapshot else {},
        test_suite_snapshot=record.testSuiteSnapshot if record.testSuiteSnapshot else {},
        dimensions=record.dimensions if record.dimensions else [],
        enable_skills_eval=record.enableSkillsEval,
        enable_trajectory_eval=record.enableTrajectoryEval if hasattr(record, 'enableTrajectoryEval') else False,
        trajectory_dimensions=record.trajectoryDimensions if hasattr(record, 'trajectoryDimensions') and record.trajectoryDimensions else [],
        concurrency=record.concurrency,
        timeout=record.timeout,
        template_id=record.templateId if hasattr(record, 'templateId') else None,
        model_override=record.modelOverride if hasattr(record, 'modelOverride') else None,
        is_baseline=record.isBaseline if hasattr(record, 'isBaseline') else False,
        baseline_run_id=record.baselineRunId if hasattr(record, 'baselineRunId') else None,
        repeat_count=getattr(record, 'repeatCount', 1) or 1,
        pass_at_k=record.passAtK if hasattr(record, 'passAtK') and record.passAtK else None,
        status=record.status,
        progress=record.progress,
        current_item=record.currentItem,
        total_items=record.totalItems,
        passed_count=record.passedCount,
        failed_count=record.failedCount,
        average_score=record.averageScore,
        error_message=record.errorMessage,
        created_at=record.createdAt,
        started_at=record.startedAt,
        completed_at=record.completedAt,
        agent_name=agent_name,
        test_suite_name=test_suite_name,
        model_config_name=model_config_name,
        results=results,
    )


def _to_result_response(record) -> EvalResultResponse:
    # 解析轨迹 JSON
    trajectory = None
    if hasattr(record, 'trajectory') and record.trajectory:
        trajectory = record.trajectory if isinstance(record.trajectory, list) else json.loads(record.trajectory) if isinstance(record.trajectory, str) else record.trajectory
    traj_scores = None
    if hasattr(record, 'trajectoryScores') and record.trajectoryScores:
        traj_scores = record.trajectoryScores if isinstance(record.trajectoryScores, dict) else json.loads(record.trajectoryScores) if isinstance(record.trajectoryScores, str) else record.trajectoryScores

    # 解析断言结果
    assertion_results = None
    if hasattr(record, 'assertionResults') and record.assertionResults:
        ar = record.assertionResults
        assertion_results = ar if isinstance(ar, list) else json.loads(ar) if isinstance(ar, str) else ar

    return EvalResultResponse(
        id=record.id,
        eval_run_id=record.evalRunId,
        test_case_id=record.testCaseId,
        input=record.input,
        expected_output=record.expectedOutput,
        agent_output=record.agentOutput,
        agent_thinking=record.agentThinking,
        skills_called=record.skillsCalled if record.skillsCalled else None,
        trajectory=trajectory,
        trajectory_scores=traj_scores,
        trajectory_overall=record.trajectoryOverall if hasattr(record, 'trajectoryOverall') else None,
        trajectory_reasoning=record.trajectoryReasoning if hasattr(record, 'trajectoryReasoning') else None,
        scores=record.scores if record.scores else {},
        overall_score=record.overallScore,
        passed=record.passed,
        assertion_results=assertion_results,
        critical_failure=record.criticalFailure if hasattr(record, 'criticalFailure') else False,
        reasoning=record.reasoning,
        latency_ms=record.latencyMs,
        token_usage=record.tokenUsage if record.tokenUsage else None,
        error_message=record.errorMessage,
        progress_rate=getattr(record, 'progressRate', None),
        sub_goal_results=getattr(record, 'subGoalResults', None),
        grounding_accuracy=getattr(record, 'groundingAccuracy', None),
        tool_eval_results=getattr(record, 'toolEvalResults', None),
        failure_analysis=getattr(record, 'failureAnalysis', None),
        cost_data=getattr(record, 'costData', None),
        created_at=record.createdAt,
    )


@router.post("", response_model=EvalRunResponse)
async def create_eval_run(data: EvalRunCreate, background_tasks: BackgroundTasks):
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    test_suite = await prisma.testsuite.find_unique(where={"id": data.test_suite_id})
    if not test_suite:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    agent_snapshot = {
        "name": agent.name,
        "agent_type": agent.agentType,
        "agent_config": agent.agentConfig,
        "system_prompt": agent.systemPrompt,
        "skills": agent.skills,
    }

    test_cases = test_suite.testCases if test_suite.testCases else []
    if isinstance(test_cases, str):
        try:
            test_cases = json.loads(test_cases)
        except (json.JSONDecodeError, TypeError):
            test_cases = []
    test_suite_snapshot = {
        "name": test_suite.name,
        "test_cases": test_cases,
    }

    total = len(test_cases) if isinstance(test_cases, list) else 0

    record = await prisma.evalrun.create(
        data={
            "agentId": data.agent_id,
            "testSuiteId": data.test_suite_id,
            "modelConfigId": data.model_config_id,
            "agentSnapshot": json.dumps(agent_snapshot),
            "testSuiteSnapshot": json.dumps(test_suite_snapshot),
            "dimensions": json.dumps(data.dimensions),
            "enableSkillsEval": data.enable_skills_eval,
            "enableTrajectoryEval": data.enable_trajectory_eval,
            "trajectoryDimensions": json.dumps(data.trajectory_dimensions) if data.trajectory_dimensions else None,
            "concurrency": data.concurrency,
            "timeout": data.timeout,
            "templateId": data.template_id,
            "modelOverride": data.model_override,
            "isBaseline": data.is_baseline,
            "repeatCount": data.repeat_count,
            "totalItems": total,
        }
    )

    background_tasks.add_task(run_eval, record.id)

    full = await prisma.evalrun.find_unique(
        where={"id": record.id},
        include={"agent": True, "testSuite": True, "modelConfig": True},
    )
    return _to_run_response(full)


@router.get("", response_model=List[EvalRunResponse])
async def list_eval_runs(status: Optional[str] = None, limit: int = 50):
    where = {}
    if status:
        where["status"] = status
    records = await prisma.evalrun.find_many(
        where=where,
        order={"createdAt": "desc"},
        take=limit,
        include={"agent": True, "testSuite": True, "modelConfig": True},
    )
    return [_to_run_response(r) for r in records]


@router.get("/{run_id}", response_model=EvalRunResponse)
async def get_eval_run(run_id: str):
    record = await prisma.evalrun.find_unique(
        where={"id": run_id},
        include={"agent": True, "testSuite": True, "modelConfig": True, "results": True},
    )
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")
    return _to_run_response(record, include_results=True)


@router.delete("/{run_id}")
async def delete_eval_run(run_id: str):
    record = await prisma.evalrun.find_unique(where={"id": run_id})
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")
    if record.status == "running":
        raise HTTPException(status_code=400, detail="运行中的评测不能直接删除，请先取消")
    await prisma.evalrun.delete(where={"id": run_id})
    return {"message": "已删除"}


@router.post("/{run_id}/cancel")
async def cancel_eval_run(run_id: str):
    record = await prisma.evalrun.find_unique(where={"id": run_id})
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")
    if record.status not in ["pending", "running"]:
        raise HTTPException(status_code=400, detail="只能取消待执行或运行中的评测")
    await prisma.evalrun.update(where={"id": run_id}, data={"status": "cancelled"})
    return {"message": "已取消"}


@router.get("/{run_id}/results", response_model=List[EvalResultResponse])
async def get_eval_results(run_id: str):
    record = await prisma.evalrun.find_unique(where={"id": run_id})
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")
    results = await prisma.evalresult.find_many(
        where={"evalRunId": run_id},
        order={"createdAt": "asc"},
    )
    return [_to_result_response(r) for r in results]


@router.post("/{run_id}/set-baseline")
async def set_baseline(run_id: str):
    """将某次评测标记为基线"""
    record = await prisma.evalrun.find_unique(where={"id": run_id})
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")
    if record.status != "completed":
        raise HTTPException(status_code=400, detail="只能将已完成的评测设为基线")

    # 取消同 Agent + TestSuite 的其他基线
    await prisma.evalrun.update_many(
        where={
            "agentId": record.agentId,
            "testSuiteId": record.testSuiteId,
            "isBaseline": True,
        },
        data={"isBaseline": False},
    )

    await prisma.evalrun.update(
        where={"id": run_id},
        data={"isBaseline": True},
    )
    return {"message": "已设为基线", "run_id": run_id}


@router.get("/{run_id}/regression")
async def get_regression(run_id: str):
    """获取与基线的回归对比"""
    from app.services.regression_service import compute_regression
    record = await prisma.evalrun.find_unique(where={"id": run_id})
    if not record:
        raise HTTPException(status_code=404, detail="评测运行不存在")

    baseline = await prisma.evalrun.find_first(
        where={
            "agentId": record.agentId,
            "testSuiteId": record.testSuiteId,
            "isBaseline": True,
            "id": {"not": run_id},
        }
    )
    if not baseline:
        raise HTTPException(status_code=404, detail="未找到基线运行")

    report = await compute_regression(baseline.id, run_id)
    return report
