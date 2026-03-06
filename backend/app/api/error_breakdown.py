"""失败归因聚合 API"""
import json
from typing import Optional
from collections import Counter
from fastapi import APIRouter, HTTPException, Query

from app.core.database import prisma

router = APIRouter(prefix="/error-breakdown", tags=["ErrorBreakdown"])


@router.get("/{run_id}")
async def get_error_breakdown(run_id: str):
    """单次评测的失败归因聚合"""
    run = await prisma.evalrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail="评测运行不存在")

    results = await prisma.evalresult.find_many(
        where={"evalRunId": run_id, "passed": False},
    )

    cause_counter = Counter()
    details = []

    for r in results:
        fa = r.failureAnalysis
        if isinstance(fa, str):
            try:
                fa = json.loads(fa)
            except (json.JSONDecodeError, TypeError):
                fa = None

        if fa and isinstance(fa, dict):
            cause = fa.get("primary_cause", "unknown")
            cause_counter[cause] += 1
            details.append({
                "test_case_id": r.testCaseId,
                "primary_cause": cause,
                "explanation": fa.get("explanation", ""),
                "suggested_fix": fa.get("suggested_fix", ""),
                "confidence": fa.get("confidence", 0),
            })
        else:
            cause_counter["unanalyzed"] += 1
            details.append({
                "test_case_id": r.testCaseId,
                "primary_cause": "unanalyzed",
                "explanation": r.errorMessage or "无归因分析数据",
                "suggested_fix": "",
                "confidence": 0,
            })

    total_failed = len(results)
    breakdown = [
        {"cause": cause, "count": count, "percentage": round(count / total_failed, 4) if total_failed > 0 else 0}
        for cause, count in cause_counter.most_common()
    ]

    return {
        "run_id": run_id,
        "total_failed": total_failed,
        "breakdown": breakdown,
        "details": details,
    }


@router.get("/agent/{agent_id}")
async def get_agent_error_breakdown(
    agent_id: str,
    limit: int = Query(default=10, ge=1, le=50, description="最近 N 次评测"),
):
    """Agent 近 N 次评测的失败归因聚合"""
    agent = await prisma.agent.find_unique(where={"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    runs = await prisma.evalrun.find_many(
        where={"agentId": agent_id, "status": "completed"},
        order={"createdAt": "desc"},
        take=limit,
    )

    if not runs:
        return {
            "agent_id": agent_id,
            "agent_name": agent.name,
            "total_runs": 0,
            "total_failed": 0,
            "breakdown": [],
            "trend": [],
        }

    run_ids = [r.id for r in runs]
    results = await prisma.evalresult.find_many(
        where={"evalRunId": {"in": run_ids}, "passed": False},
    )

    cause_counter = Counter()
    per_run_causes = {}

    for r in results:
        fa = r.failureAnalysis
        if isinstance(fa, str):
            try:
                fa = json.loads(fa)
            except (json.JSONDecodeError, TypeError):
                fa = None

        cause = "unanalyzed"
        if fa and isinstance(fa, dict):
            cause = fa.get("primary_cause", "unknown")

        cause_counter[cause] += 1
        per_run_causes.setdefault(r.evalRunId, Counter())[cause] += 1

    total_failed = len(results)
    breakdown = [
        {"cause": cause, "count": count, "percentage": round(count / total_failed, 4) if total_failed > 0 else 0}
        for cause, count in cause_counter.most_common()
    ]

    # 按时间排序的趋势
    trend = []
    for r in reversed(runs):
        run_causes = per_run_causes.get(r.id, Counter())
        trend.append({
            "run_id": r.id,
            "created_at": r.createdAt.isoformat() if r.createdAt else "",
            "causes": dict(run_causes),
        })

    return {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "total_runs": len(runs),
        "total_failed": total_failed,
        "breakdown": breakdown,
        "trend": trend,
    }
