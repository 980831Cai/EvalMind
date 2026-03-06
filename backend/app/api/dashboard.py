"""Dashboard API — Prisma 版本"""
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query
from app.core.database import prisma

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("")
async def get_dashboard(
    agent_id: Optional[str] = Query(None, description="按 Agent 筛选"),
):
    # 构建基础过滤条件
    run_where = {"agentId": agent_id} if agent_id else {}
    result_where = {"evalRun": {"is": {"agentId": agent_id}}} if agent_id else {}
    result_score_where = {**result_where, "overallScore": {"gt": 0}}

    agents_count = await prisma.agent.count()
    suites_count = await prisma.testsuite.count()
    runs_count = await prisma.evalrun.count(where=run_where if run_where else None)
    results_count = await prisma.evalresult.count(where=result_where if result_where else None)

    completed_runs = await prisma.evalrun.count(where={**run_where, "status": "completed"})
    failed_runs = await prisma.evalrun.count(where={**run_where, "status": "failed"})
    running_runs = await prisma.evalrun.count(where={**run_where, "status": "running"})

    completed_results = await prisma.evalresult.find_many(
        where=result_score_where if result_score_where else {"overallScore": {"gt": 0}},
    )
    all_scores = [r.overallScore for r in completed_results if r.overallScore]
    avg_score = round(sum(all_scores) / len(all_scores), 3) if all_scores else 0

    all_latencies = [r.latencyMs for r in completed_results if r.latencyMs and r.latencyMs > 0]
    avg_latency_ms = int(sum(all_latencies) / len(all_latencies)) if all_latencies else 0

    recent_runs_raw = await prisma.evalrun.find_many(
        where=run_where if run_where else None,
        order={"createdAt": "desc"},
        take=10,
        include={"agent": True, "testSuite": True, "modelConfig": True},
    )

    recent_runs = []
    for r in recent_runs_raw:
        recent_runs.append({
            "id": r.id,
            "agent_id": r.agentId,
            "agent_name": r.agent.name if r.agent else "",
            "test_suite_id": r.testSuiteId,
            "test_suite_name": r.testSuite.name if r.testSuite else "",
            "status": r.status,
            "progress": r.progress,
            "total_items": r.totalItems,
            "passed_count": r.passedCount,
            "failed_count": r.failedCount,
            "average_score": float(r.averageScore) if r.averageScore else None,
            "created_at": r.createdAt.isoformat() if r.createdAt else "",
            "completed_at": r.completedAt.isoformat() if r.completedAt else None,
        })

    dimension_scores_all = {}
    for r in completed_results:
        if r.scores and isinstance(r.scores, dict):
            for dim, score in r.scores.items():
                if isinstance(score, (int, float)):
                    dimension_scores_all.setdefault(dim, []).append(score)
    dimension_averages = {
        k: round(sum(v) / len(v), 3) for k, v in dimension_scores_all.items()
    }

    # 使用批量查询替代 N+1：一次性获取所有 Agent 的评测结果
    agents = await prisma.agent.find_many(order={"createdAt": "desc"})
    agent_ids = [a.id for a in agents]

    # 批量获取每个 Agent 的 run 数量
    agent_run_counts = {}
    for aid in agent_ids:
        agent_run_counts[aid] = await prisma.evalrun.count(where={"agentId": aid})

    # 批量获取所有 Agent 的有效评测结果（一次查询）
    all_agent_results = await prisma.evalresult.find_many(
        where={
            "evalRun": {"is": {"agentId": {"in": agent_ids}}},
            "overallScore": {"gt": 0},
        },
        include={"evalRun": {"include": {"agent": False}}},
    )

    # 按 agentId 分组
    agent_results_map: dict[str, list] = {aid: [] for aid in agent_ids}
    for r in all_agent_results:
        if r.evalRun and r.evalRun.agentId:
            agent_results_map.setdefault(r.evalRun.agentId, []).append(r)

    agent_stats = []
    for agent in agents:
        a_results = agent_results_map.get(agent.id, [])
        a_scores = [r.overallScore for r in a_results if r.overallScore]
        a_latencies = [r.latencyMs for r in a_results if r.latencyMs and r.latencyMs > 0]

        agent_stats.append({
            "id": agent.id,
            "name": agent.name,
            "agent_type": agent.agentType,
            "total_runs": agent_run_counts.get(agent.id, 0),
            "total_results": len(a_results),
            "avg_score": round(sum(a_scores) / len(a_scores), 3) if a_scores else 0,
            "avg_latency_ms": int(sum(a_latencies) / len(a_latencies)) if a_latencies else 0,
        })

    score_distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
    for s in all_scores:
        if s >= 0.8:
            score_distribution["excellent"] += 1
        elif s >= 0.6:
            score_distribution["good"] += 1
        elif s >= 0.4:
            score_distribution["fair"] += 1
        else:
            score_distribution["poor"] += 1

    return {
        "total_agents": agents_count,
        "total_test_suites": suites_count,
        "total_eval_runs": runs_count,
        "total_eval_results": results_count,
        "completed_runs": completed_runs,
        "failed_runs": failed_runs,
        "running_runs": running_runs,
        "avg_score": avg_score,
        "avg_latency_ms": avg_latency_ms,
        "dimension_averages": dimension_averages,
        "agent_stats": agent_stats,
        "score_distribution": score_distribution,
        "recent_runs": recent_runs,
    }


@router.get("/agent-trend")
async def get_agent_trend(
    agent_id: str = Query(..., description="Agent ID"),
):
    """获取单个 Agent 的评测趋势数据：最近 20 次已完成评测的得分、通过率、延迟变化"""
    runs = await prisma.evalrun.find_many(
        where={"agentId": agent_id, "status": "completed"},
        order={"createdAt": "asc"},
        take=20,
        include={"testSuite": True},
    )

    if not runs:
        return {"agent_id": agent_id, "trend": []}

    # 批量获取所有 run 的结果（一次查询替代 N 次）
    run_ids = [r.id for r in runs]
    all_results = await prisma.evalresult.find_many(
        where={"evalRunId": {"in": run_ids}},
    )

    # 按 runId 分组
    results_by_run: dict[str, list] = {rid: [] for rid in run_ids}
    for res in all_results:
        results_by_run.setdefault(res.evalRunId, []).append(res)

    trend = []
    for r in runs:
        results = results_by_run.get(r.id, [])
        total = len(results)
        passed = sum(1 for res in results if res.passed)
        pass_rate = round(passed / total, 3) if total > 0 else 0

        latencies = [res.latencyMs for res in results if res.latencyMs and res.latencyMs > 0]
        avg_latency = int(sum(latencies) / len(latencies)) if latencies else 0

        # 各维度得分
        dim_scores: dict[str, list[float]] = {}
        for res in results:
            if res.scores and isinstance(res.scores, dict):
                for dim, score in res.scores.items():
                    if isinstance(score, (int, float)):
                        dim_scores.setdefault(dim, []).append(score)
        dim_averages = {k: round(sum(v) / len(v), 3) for k, v in dim_scores.items()}

        trend.append({
            "run_id": r.id,
            "test_suite_name": r.testSuite.name if r.testSuite else "",
            "avg_score": float(r.averageScore) if r.averageScore else 0,
            "pass_rate": pass_rate,
            "avg_latency_ms": avg_latency,
            "total_items": total,
            "passed_count": passed,
            "failed_count": total - passed,
            "dimension_averages": dim_averages,
            "created_at": r.createdAt.isoformat() if r.createdAt else "",
        })

    return {"agent_id": agent_id, "trend": trend}


@router.get("/live-stats")
async def get_live_stats():
    """所有运行中评测的实时状态"""
    running_runs = await prisma.evalrun.find_many(
        where={"status": "running"},
        include={"agent": True, "testSuite": True},
    )

    stats = []
    for r in running_runs:
        elapsed_seconds = 0
        if r.startedAt:
            elapsed_seconds = int((datetime.now(timezone.utc) - r.startedAt.replace(tzinfo=timezone.utc)).total_seconds())

        total = r.totalItems or 1
        completed = r.currentItem or 0
        passed = r.passedCount or 0
        failed = r.failedCount or 0

        # 估算剩余时间
        estimated_remaining = None
        if completed > 0 and elapsed_seconds > 0:
            rate = completed / elapsed_seconds
            remaining_items = total - completed
            estimated_remaining = int(remaining_items / rate) if rate > 0 else None

        current_pass_rate = round(passed / completed, 4) if completed > 0 else 0

        stats.append({
            "run_id": r.id,
            "agent_name": r.agent.name if r.agent else "",
            "test_suite_name": r.testSuite.name if r.testSuite else "",
            "progress": r.progress or 0,
            "total_items": total,
            "completed_items": completed,
            "passed": passed,
            "failed": failed,
            "current_pass_rate": current_pass_rate,
            "elapsed_seconds": elapsed_seconds,
            "estimated_remaining": estimated_remaining,
            "started_at": r.startedAt.isoformat() if r.startedAt else None,
        })

    return {"running_count": len(stats), "runs": stats}


@router.get("/capability-radar/{agent_id}")
async def get_capability_radar(agent_id: str):
    """能力雷达图数据：聚合多维度得分"""
    agent = await prisma.agent.find_unique(where={"id": agent_id})
    if not agent:
        return {"agent_id": agent_id, "dimensions": {}, "error": "Agent 不存在"}

    # 获取最近已完成的评测结果
    runs = await prisma.evalrun.find_many(
        where={"agentId": agent_id, "status": "completed"},
        order={"createdAt": "desc"},
        take=10,
    )

    if not runs:
        return {"agent_id": agent_id, "agent_name": agent.name, "dimensions": {}}

    run_ids = [r.id for r in runs]
    results = await prisma.evalresult.find_many(
        where={"evalRunId": {"in": run_ids}, "overallScore": {"gt": 0}},
    )

    # 聚合 LLM 维度得分
    dim_scores = {}
    latencies = []
    grounding_values = []
    progress_values = []

    for res in results:
        if res.scores and isinstance(res.scores, dict):
            for dim, score in res.scores.items():
                if isinstance(score, (int, float)):
                    dim_scores.setdefault(dim, []).append(score)
        if res.latencyMs and res.latencyMs > 0:
            latencies.append(res.latencyMs)

        ga = getattr(res, 'groundingAccuracy', None)
        if ga is not None:
            grounding_values.append(ga)

        pr = getattr(res, 'progressRate', None)
        if pr is not None:
            progress_values.append(pr)

    # 计算各维度平均分
    radar_data = {}
    for dim, scores_list in dim_scores.items():
        radar_data[dim] = round(sum(scores_list) / len(scores_list), 4)

    # 通过率
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    radar_data["pass_rate"] = round(passed / total, 4) if total > 0 else 0

    # 响应速度（延迟归一化到 0-1：3s 以内为 1.0，30s 以上为 0）
    if latencies:
        avg_latency_ms = sum(latencies) / len(latencies)
        speed_score = max(0, min(1.0, 1.0 - (avg_latency_ms - 3000) / 27000))
        radar_data["response_speed"] = round(speed_score, 4)

    # Grounding Accuracy
    if grounding_values:
        radar_data["grounding_accuracy"] = round(sum(grounding_values) / len(grounding_values), 4)

    # Progress Rate
    if progress_values:
        radar_data["progress_rate"] = round(sum(progress_values) / len(progress_values), 4)

    return {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "dimensions": radar_data,
        "total_results": total,
    }
