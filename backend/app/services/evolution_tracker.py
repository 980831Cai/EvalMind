"""进化事件追踪服务 - 记录评测事件、策略应用、里程碑"""
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from app.core.database import get_db

logger = logging.getLogger("evolution_tracker")


async def record_eval_event(
    agent_id: str,
    eval_run_id: str,
    overall_score: float,
    pass_rate: float,
    dimension_scores: Dict[str, float],
    gene_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """记录评测完成事件"""
    db = get_db()

    # 获取前一次评测的分数作为 scoresBefore
    prev_event = await db.evolutionevent.find_first(
        where={"agentId": agent_id, "eventType": "eval_completed"},
        order={"createdAt": "desc"},
    )

    scores_before = None
    if prev_event and prev_event.scoresAfter:
        try:
            scores_before = json.loads(prev_event.scoresAfter) if isinstance(prev_event.scoresAfter, str) else prev_event.scoresAfter
        except (json.JSONDecodeError, TypeError):
            scores_before = None

    # 生成事件摘要
    summary = f"评测完成，总分 {round(overall_score, 2)}，通过率 {round(pass_rate * 100, 1)}%"
    if scores_before and prev_event:
        prev_score = prev_event.overallScore or 0
        delta = overall_score - prev_score
        if delta > 0.5:
            summary += f"，较上次提升 {round(delta, 2)} 分"
        elif delta < -0.5:
            summary += f"，较上次下降 {round(abs(delta), 2)} 分"

    event = await db.evolutionevent.create(
        data={
            "agentId": agent_id,
            "eventType": "eval_completed",
            "evalRunId": eval_run_id,
            "geneIds": json.dumps(gene_ids) if gene_ids else None,
            "scoresBefore": json.dumps(scores_before) if scores_before else None,
            "scoresAfter": json.dumps(dimension_scores),
            "overallScore": overall_score,
            "passRate": pass_rate,
            "summary": summary,
        }
    )

    # 检测里程碑
    await _check_milestones(agent_id, overall_score, pass_rate, prev_event)

    logger.info(f"Evolution event recorded: {event.id} for agent {agent_id}")
    return _format_event(event)


async def record_strategy_applied(
    agent_id: str,
    gene_ids: List[str],
    eval_run_id: Optional[str] = None,
    summary: Optional[str] = None,
) -> Dict[str, Any]:
    """记录策略应用事件"""
    db = get_db()
    event = await db.evolutionevent.create(
        data={
            "agentId": agent_id,
            "eventType": "strategy_applied",
            "evalRunId": eval_run_id,
            "geneIds": json.dumps(gene_ids),
            "summary": summary or f"应用了 {len(gene_ids)} 个策略",
        }
    )
    logger.info(f"Strategy applied event: {event.id}, genes={gene_ids}")
    return _format_event(event)


async def get_evolution_timeline(
    agent_id: str,
    days: Optional[int] = 30,
    event_type: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """获取 Agent 进化时间线"""
    db = get_db()
    where: Dict[str, Any] = {"agentId": agent_id}

    if days:
        since = datetime.now() - timedelta(days=days)
        where["createdAt"] = {"gte": since}
    if event_type:
        where["eventType"] = event_type

    events = await db.evolutionevent.find_many(
        where=where,
        order={"createdAt": "asc"},
        take=limit,
    )

    # 构建维度分数趋势
    dimension_trends: Dict[str, List[Dict]] = {}
    score_trend = []
    pass_rate_trend = []

    for evt in events:
        if evt.eventType == "eval_completed":
            ts = evt.createdAt.isoformat() if evt.createdAt else None
            if evt.overallScore is not None:
                score_trend.append({"time": ts, "value": evt.overallScore, "eval_run_id": evt.evalRunId})
            if evt.passRate is not None:
                pass_rate_trend.append({"time": ts, "value": evt.passRate})

            try:
                scores_after = json.loads(evt.scoresAfter) if isinstance(evt.scoresAfter, str) else evt.scoresAfter
            except (json.JSONDecodeError, TypeError):
                scores_after = {}
            if isinstance(scores_after, dict):
                for dim, score in scores_after.items():
                    if dim not in dimension_trends:
                        dimension_trends[dim] = []
                    dimension_trends[dim].append({"time": ts, "value": score})

    # 提取里程碑
    milestones = [_format_event(e) for e in events if e.eventType == "milestone"]

    return {
        "agent_id": agent_id,
        "events": [_format_event(e) for e in events],
        "score_trend": score_trend,
        "pass_rate_trend": pass_rate_trend,
        "dimension_trends": dimension_trends,
        "milestones": milestones,
        "total_events": len(events),
    }


async def _check_milestones(
    agent_id: str,
    current_score: float,
    current_pass_rate: float,
    prev_event: Optional[Any],
) -> None:
    """检测是否达到里程碑"""
    db = get_db()

    if not prev_event:
        # 首次评测
        await db.evolutionevent.create(
            data={
                "agentId": agent_id,
                "eventType": "milestone",
                "overallScore": current_score,
                "passRate": current_pass_rate,
                "summary": "首次评测完成",
                "metadata": json.dumps({"type": "first_eval"}),
            }
        )
        return

    prev_score = prev_event.overallScore or 0
    delta = current_score - prev_score

    # 显著提升（>1分）
    if delta > 1.0:
        await db.evolutionevent.create(
            data={
                "agentId": agent_id,
                "eventType": "milestone",
                "overallScore": current_score,
                "passRate": current_pass_rate,
                "summary": f"评分显著提升: {round(prev_score, 2)} → {round(current_score, 2)} (+{round(delta, 2)})",
                "metadata": json.dumps({"type": "significant_improvement", "delta": delta}),
            }
        )
    # 显著退化（<-1分）
    elif delta < -1.0:
        await db.evolutionevent.create(
            data={
                "agentId": agent_id,
                "eventType": "milestone",
                "overallScore": current_score,
                "passRate": current_pass_rate,
                "summary": f"评分显著退化: {round(prev_score, 2)} → {round(current_score, 2)} ({round(delta, 2)})",
                "metadata": json.dumps({"type": "significant_regression", "delta": delta}),
            }
        )

    # 通过率达到新高
    prev_pass_rate = prev_event.passRate or 0
    if current_pass_rate >= 0.9 and prev_pass_rate < 0.9:
        await db.evolutionevent.create(
            data={
                "agentId": agent_id,
                "eventType": "milestone",
                "overallScore": current_score,
                "passRate": current_pass_rate,
                "summary": f"通过率突破 90%: {round(current_pass_rate * 100, 1)}%",
                "metadata": json.dumps({"type": "pass_rate_milestone", "threshold": 0.9}),
            }
        )


def _format_event(event) -> Dict[str, Any]:
    """格式化 EvolutionEvent"""
    try:
        gene_ids = json.loads(event.geneIds) if isinstance(event.geneIds, str) else event.geneIds
    except (json.JSONDecodeError, TypeError):
        gene_ids = None
    try:
        scores_before = json.loads(event.scoresBefore) if isinstance(event.scoresBefore, str) else event.scoresBefore
    except (json.JSONDecodeError, TypeError):
        scores_before = None
    try:
        scores_after = json.loads(event.scoresAfter) if isinstance(event.scoresAfter, str) else event.scoresAfter
    except (json.JSONDecodeError, TypeError):
        scores_after = None
    try:
        metadata = json.loads(event.metadata) if isinstance(event.metadata, str) else event.metadata
    except (json.JSONDecodeError, TypeError):
        metadata = None

    return {
        "id": event.id,
        "agent_id": event.agentId,
        "event_type": event.eventType,
        "eval_run_id": event.evalRunId,
        "gene_ids": gene_ids,
        "scores_before": scores_before,
        "scores_after": scores_after,
        "overall_score": event.overallScore,
        "pass_rate": event.passRate,
        "summary": event.summary,
        "metadata": metadata,
        "created_at": event.createdAt.isoformat() if event.createdAt else None,
    }
