"""Skills 健康度分析 API"""
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import prisma
from app.models.pydantic_models import SkillsAnalysisResponse
from app.services.skills_analyzer import analyze_skills

router = APIRouter(prefix="/skills-analysis", tags=["SkillsAnalysis"])


class AnalyzeRequest(BaseModel):
    agent_id: str
    model_config_id: Optional[str] = None


@router.post("", response_model=SkillsAnalysisResponse)
async def trigger_analysis(data: AnalyzeRequest):
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    result = await analyze_skills(data.agent_id, data.model_config_id)
    record = await prisma.skillsanalysis.find_unique(where={"id": result["id"]})
    return _to_response(record)


@router.get("", response_model=List[SkillsAnalysisResponse])
async def list_analyses(agent_id: Optional[str] = None, limit: int = 20):
    where = {}
    if agent_id:
        where["agentId"] = agent_id
    records = await prisma.skillsanalysis.find_many(
        where=where,
        order={"createdAt": "desc"},
        take=limit,
    )
    return [_to_response(r) for r in records]


@router.get("/{analysis_id}", response_model=SkillsAnalysisResponse)
async def get_analysis(analysis_id: str):
    record = await prisma.skillsanalysis.find_unique(where={"id": analysis_id})
    if not record:
        raise HTTPException(status_code=404, detail="分析记录不存在")
    return _to_response(record)


@router.delete("/{analysis_id}")
async def delete_analysis(analysis_id: str):
    record = await prisma.skillsanalysis.find_unique(where={"id": analysis_id})
    if not record:
        raise HTTPException(status_code=404, detail="分析记录不存在")
    await prisma.skillsanalysis.delete(where={"id": analysis_id})
    return {"message": "已删除"}


def _to_response(record) -> SkillsAnalysisResponse:
    usage_stats = record.usageStats
    if isinstance(usage_stats, str):
        usage_stats = json.loads(usage_stats)

    security_review = record.securityReview
    if isinstance(security_review, str):
        security_review = json.loads(security_review)

    design_review = record.designReview
    if isinstance(design_review, str):
        design_review = json.loads(design_review)

    return SkillsAnalysisResponse(
        id=record.id,
        agent_id=record.agentId,
        usage_stats=usage_stats if isinstance(usage_stats, dict) else {},
        security_review=security_review if isinstance(security_review, dict) else None,
        design_review=design_review if isinstance(design_review, dict) else None,
        created_at=record.createdAt,
    )
