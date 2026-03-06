"""Score API - 独立评分实体的 CRUD"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import score_service

router = APIRouter(tags=["scores"])


# ===== Request Models =====
class ScoreCreate(BaseModel):
    trace_id: str
    span_id: Optional[str] = None
    name: str = Field(..., max_length=100)
    value: Optional[float] = None
    string_value: Optional[str] = Field(None, max_length=200)
    comment: Optional[str] = None
    source: str = Field(..., max_length=20)  # manual, automated, sdk, user_feedback
    author: Optional[str] = Field(None, max_length=100)
    eval_config_id: Optional[str] = None


class ScoreUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    value: Optional[float] = None
    string_value: Optional[str] = Field(None, max_length=200)
    comment: Optional[str] = None
    source: Optional[str] = Field(None, max_length=20)
    author: Optional[str] = Field(None, max_length=100)
    span_id: Optional[str] = None


# ===== Routes =====
@router.post("/scores")
async def create_score(body: ScoreCreate):
    """创建 Score"""
    try:
        score = await score_service.create_score(
            trace_id=body.trace_id,
            name=body.name,
            source=body.source,
            span_id=body.span_id,
            value=body.value,
            string_value=body.string_value,
            comment=body.comment,
            author=body.author,
            eval_config_id=body.eval_config_id,
        )
        return score
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scores")
async def list_scores(
    trace_id: Optional[str] = Query(None),
    span_id: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    eval_config_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """查询 Score 列表"""
    return await score_service.list_scores(
        trace_id=trace_id,
        span_id=span_id,
        name=name,
        source=source,
        author=author,
        eval_config_id=eval_config_id,
        page=page,
        limit=limit,
    )


@router.get("/scores/stats")
async def get_score_stats(
    name: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    trace_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    """Score 统计聚合"""
    return await score_service.get_score_stats(
        name=name, source=source, trace_id=trace_id, days=days
    )


@router.get("/scores/{score_id}")
async def get_score(score_id: str):
    """获取单个 Score"""
    score = await score_service.get_score(score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    return score


@router.put("/scores/{score_id}")
async def update_score(score_id: str, body: ScoreUpdate):
    """更新 Score"""
    existing = await score_service.get_score(score_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Score not found")
    updated = await score_service.update_score(score_id, body.model_dump(exclude_none=True))
    return updated


@router.delete("/scores/{score_id}")
async def delete_score(score_id: str):
    """删除 Score"""
    success = await score_service.delete_score(score_id)
    if not success:
        raise HTTPException(status_code=404, detail="Score not found")
    return {"message": "Score deleted"}


@router.get("/traces/{trace_id}/scores")
async def get_trace_scores(trace_id: str):
    """获取某个 Trace 的所有 Score"""
    return await score_service.get_trace_scores(trace_id)
