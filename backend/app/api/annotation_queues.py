"""标注队列 API — 管理人工标注任务"""
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("annotation_queues")

router = APIRouter(prefix="/annotation-queues", tags=["Annotation Queues"])


class AnnotationQueueCreate(BaseModel):
    name: str
    description: Optional[str] = None
    filter_config: dict = {}
    score_configs: List[dict] = []
    assignees: Optional[List[str]] = None


class AnnotationQueueUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    filter_config: Optional[dict] = None
    score_configs: Optional[List[dict]] = None
    assignees: Optional[List[str]] = None
    status: Optional[str] = None


def _serialize(record) -> dict:
    return {
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "filter_config": record.filterConfig if isinstance(record.filterConfig, dict) else json.loads(record.filterConfig) if isinstance(record.filterConfig, str) else {},
        "score_configs": record.scoreConfigs if isinstance(record.scoreConfigs, list) else json.loads(record.scoreConfigs) if isinstance(record.scoreConfigs, str) else [],
        "assignees": record.assignees if isinstance(record.assignees, (list, type(None))) else json.loads(record.assignees) if isinstance(record.assignees, str) else None,
        "total_items": record.totalItems,
        "completed_items": record.completedItems,
        "status": record.status,
        "created_at": record.createdAt.isoformat() if record.createdAt else None,
        "updated_at": record.updatedAt.isoformat() if record.updatedAt else None,
    }


@router.post("")
async def create_queue(data: AnnotationQueueCreate):
    # 计算匹配的 Trace 数量
    total = await _count_matching_traces(data.filter_config)

    queue = await prisma.annotationqueue.create(data={
        "name": data.name,
        "description": data.description,
        "filterConfig": json.dumps(data.filter_config),
        "scoreConfigs": json.dumps(data.score_configs),
        "assignees": json.dumps(data.assignees) if data.assignees else None,
        "totalItems": total,
    })
    return _serialize(queue)


@router.get("")
async def list_queues():
    queues = await prisma.annotationqueue.find_many(
        order={"createdAt": "desc"}
    )
    return [_serialize(q) for q in queues]


@router.get("/{queue_id}")
async def get_queue(queue_id: str):
    queue = await prisma.annotationqueue.find_unique(where={"id": queue_id})
    if not queue:
        raise HTTPException(status_code=404, detail="队列不存在")
    return _serialize(queue)


@router.put("/{queue_id}")
async def update_queue(queue_id: str, data: AnnotationQueueUpdate):
    existing = await prisma.annotationqueue.find_unique(where={"id": queue_id})
    if not existing:
        raise HTTPException(status_code=404, detail="队列不存在")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.filter_config is not None:
        update_data["filterConfig"] = json.dumps(data.filter_config)
        # 重新计算匹配数量
        update_data["totalItems"] = await _count_matching_traces(data.filter_config)
    if data.score_configs is not None:
        update_data["scoreConfigs"] = json.dumps(data.score_configs)
    if data.assignees is not None:
        update_data["assignees"] = json.dumps(data.assignees)
    if data.status is not None:
        update_data["status"] = data.status

    queue = await prisma.annotationqueue.update(
        where={"id": queue_id},
        data=update_data,
    )
    return _serialize(queue)


@router.delete("/{queue_id}")
async def delete_queue(queue_id: str):
    existing = await prisma.annotationqueue.find_unique(where={"id": queue_id})
    if not existing:
        raise HTTPException(status_code=404, detail="队列不存在")
    await prisma.annotationqueue.delete(where={"id": queue_id})
    return {"message": "已删除"}


@router.get("/{queue_id}/items")
async def get_queue_items(
    queue_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """获取标注队列中匹配的 Trace 列表"""
    queue = await prisma.annotationqueue.find_unique(where={"id": queue_id})
    if not queue:
        raise HTTPException(status_code=404, detail="队列不存在")

    filter_config = queue.filterConfig
    if isinstance(filter_config, str):
        filter_config = json.loads(filter_config)

    where = _build_trace_where(filter_config)
    skip = (page - 1) * limit

    total = await prisma.trace.count(where=where)
    traces = await prisma.trace.find_many(
        where=where,
        order={"createdAt": "desc"},
        skip=skip,
        take=limit,
    )

    return {
        "data": [{
            "id": t.id,
            "name": t.name,
            "source": t.source,
            "agent_id": t.agentId,
            "input": t.inputText[:200] if t.inputText else None,
            "output": t.outputText[:200] if t.outputText else None,
            "status": t.status,
            "total_latency_ms": t.totalLatencyMs,
            "created_at": t.createdAt.isoformat() if t.createdAt else None,
        } for t in traces],
        "total": total,
    }


@router.post("/{queue_id}/items/{trace_id}/complete")
async def complete_annotation(queue_id: str, trace_id: str):
    """完成一条 Trace 的标注"""
    queue = await prisma.annotationqueue.find_unique(where={"id": queue_id})
    if not queue:
        raise HTTPException(status_code=404, detail="队列不存在")

    # 递增完成数
    new_completed = queue.completedItems + 1
    update_data = {"completedItems": new_completed}

    # 如果全部完成，标记队列为 completed
    if new_completed >= queue.totalItems:
        update_data["status"] = "completed"

    await prisma.annotationqueue.update(
        where={"id": queue_id},
        data=update_data,
    )

    return {"message": "标注完成", "completed_items": new_completed}


async def _count_matching_traces(filter_config: dict) -> int:
    where = _build_trace_where(filter_config)
    return await prisma.trace.count(where=where)


def _build_trace_where(filter_config: dict) -> dict:
    """根据过滤配置构建 Prisma where 条件"""
    where: dict = {}

    agent_ids = filter_config.get("agent_ids")
    if agent_ids and isinstance(agent_ids, list):
        where["agentId"] = {"in": agent_ids}

    source = filter_config.get("source")
    if source:
        if isinstance(source, list):
            where["source"] = {"in": source}
        else:
            where["source"] = source

    status = filter_config.get("status")
    if status:
        if isinstance(status, list):
            where["status"] = {"in": status}
        else:
            where["status"] = status

    min_latency = filter_config.get("min_latency_ms")
    if min_latency:
        where["totalLatencyMs"] = {"gte": int(min_latency)}

    return where
