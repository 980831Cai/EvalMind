"""进化历史 API - 查询进化时间线和里程碑"""
from fastapi import APIRouter, Query
from typing import Optional

from app.services.evolution_tracker import get_evolution_timeline

router = APIRouter(prefix="/evolution", tags=["evolution"])


@router.get("/timeline/{agent_id}")
async def get_timeline(
    agent_id: str,
    days: Optional[int] = Query(30, ge=1, le=365),
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """获取 Agent 进化时间线"""
    return await get_evolution_timeline(
        agent_id=agent_id,
        days=days,
        event_type=event_type,
        limit=limit,
    )
