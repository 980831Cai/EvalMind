"""在线评估配置 API — 管理自动评估规则"""
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from prisma import Json as PrismaJson

from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("online_eval")

router = APIRouter(prefix="/online-eval", tags=["Online Eval"])


class OnlineEvalConfigCreate(BaseModel):
    name: str
    description: Optional[str] = None
    agent_ids: List[str] = []
    dimensions: List[str] = []
    model_config_id: str
    sample_rate: float = 1.0
    is_active: bool = True
    alert_rules: Optional[List[dict]] = None


class OnlineEvalConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    agent_ids: Optional[List[str]] = None
    dimensions: Optional[List[str]] = None
    model_config_id: Optional[str] = None
    sample_rate: Optional[float] = None
    is_active: Optional[bool] = None
    alert_rules: Optional[List[dict]] = None


def _serialize(record) -> dict:
    data = {
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "agent_ids": record.agentIds if isinstance(record.agentIds, list) else json.loads(record.agentIds) if isinstance(record.agentIds, str) else [],
        "dimensions": record.dimensions if isinstance(record.dimensions, list) else json.loads(record.dimensions) if isinstance(record.dimensions, str) else [],
        "model_config_id": record.modelConfigId,
        "sample_rate": record.sampleRate,
        "is_active": record.isActive,
        "alert_rules": record.alertRules if isinstance(record.alertRules, (list, type(None))) else json.loads(record.alertRules) if isinstance(record.alertRules, str) else None,
        "created_at": record.createdAt.isoformat() if record.createdAt else None,
        "updated_at": record.updatedAt.isoformat() if record.updatedAt else None,
    }
    return data


@router.post("/configs")
async def create_config(data: OnlineEvalConfigCreate):
    config = await prisma.onlineevalconfig.create(data={
        "name": data.name,
        "description": data.description,
        "agentIds": json.dumps(data.agent_ids),
        "dimensions": json.dumps(data.dimensions),
        "modelConfigId": data.model_config_id,
        "sampleRate": data.sample_rate,
        "isActive": data.is_active,
        "alertRules": PrismaJson(data.alert_rules) if data.alert_rules else PrismaJson([]),
    })
    return _serialize(config)


@router.get("/configs")
async def list_configs():
    configs = await prisma.onlineevalconfig.find_many(
        order={"createdAt": "desc"}
    )
    return [_serialize(c) for c in configs]


@router.get("/configs/{config_id}")
async def get_config(config_id: str):
    config = await prisma.onlineevalconfig.find_unique(where={"id": config_id})
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return _serialize(config)


@router.put("/configs/{config_id}")
async def update_config(config_id: str, data: OnlineEvalConfigUpdate):
    existing = await prisma.onlineevalconfig.find_unique(where={"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.agent_ids is not None:
        update_data["agentIds"] = json.dumps(data.agent_ids)
    if data.dimensions is not None:
        update_data["dimensions"] = json.dumps(data.dimensions)
    if data.model_config_id is not None:
        update_data["modelConfigId"] = data.model_config_id
    if data.sample_rate is not None:
        update_data["sampleRate"] = data.sample_rate
    if data.is_active is not None:
        update_data["isActive"] = data.is_active
    if data.alert_rules is not None:
        update_data["alertRules"] = PrismaJson(data.alert_rules)

    config = await prisma.onlineevalconfig.update(
        where={"id": config_id},
        data=update_data,
    )
    return _serialize(config)


@router.delete("/configs/{config_id}")
async def delete_config(config_id: str):
    existing = await prisma.onlineevalconfig.find_unique(where={"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="配置不存在")
    await prisma.onlineevalconfig.delete(where={"id": config_id})
    return {"message": "已删除"}


@router.post("/configs/{config_id}/toggle")
async def toggle_config(config_id: str):
    config = await prisma.onlineevalconfig.find_unique(where={"id": config_id})
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    updated = await prisma.onlineevalconfig.update(
        where={"id": config_id},
        data={"isActive": not config.isActive},
    )
    return {"is_active": updated.isActive}


@router.get("/stats")
async def get_stats():
    """在线评估统计：评估量、活跃配置数等"""
    total_configs = await prisma.onlineevalconfig.count()
    active_configs = await prisma.onlineevalconfig.count(where={"isActive": True})

    # 统计 automated source 的 Score
    automated_scores = await prisma.score.count(where={"source": "automated"})

    return {
        "total_configs": total_configs,
        "active_configs": active_configs,
        "total_automated_scores": automated_scores,
    }


@router.get("/alerts")
async def get_alerts():
    """获取告警历史（从 Score 中查找低分记录）"""
    # 查找 automated 来源的低分 Score
    low_scores = await prisma.score.find_many(
        where={
            "source": "automated",
            "value": {"lt": 0.5},
        },
        order={"createdAt": "desc"},
        take=50,
    )
    return [{
        "id": s.id,
        "trace_id": s.traceId,
        "dimension": s.name,
        "value": s.value,
        "comment": s.comment,
        "created_at": s.createdAt.isoformat() if s.createdAt else None,
    } for s in low_scores]
