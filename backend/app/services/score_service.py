"""Score 服务 - 独立评分实体的 CRUD 和统计"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from prisma import Json as PrismaJson
from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("score_service")


async def create_score(
    trace_id: str,
    name: str,
    source: str,
    span_id: Optional[str] = None,
    value: Optional[float] = None,
    string_value: Optional[str] = None,
    comment: Optional[str] = None,
    author: Optional[str] = None,
    eval_config_id: Optional[str] = None,
) -> Dict[str, Any]:
    """创建一条 Score 记录"""
    score_id = str(uuid.uuid4())

    data: Dict[str, Any] = {
        "id": score_id,
        "trace": {"connect": {"id": trace_id}},
        "name": name,
        "source": source,
    }

    if span_id is not None:
        data["spanId"] = span_id
    if value is not None:
        data["value"] = value
    if string_value is not None:
        data["stringValue"] = string_value
    if comment is not None:
        data["comment"] = comment
    if author is not None:
        data["author"] = author
    if eval_config_id is not None:
        data["evalConfigId"] = eval_config_id

    score = await prisma.score.create(data=data)
    logger.info("score_created", score_id=score_id, trace_id=trace_id, name=name, source=source)
    return _serialize(score)


async def get_score(score_id: str) -> Optional[Dict[str, Any]]:
    """获取单个 Score"""
    score = await prisma.score.find_unique(where={"id": score_id})
    return _serialize(score) if score else None


async def update_score(score_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """更新 Score"""
    update_data: Dict[str, Any] = {}
    for field in ("name", "source", "author", "comment"):
        if field in data and data[field] is not None:
            # Prisma 使用 camelCase
            key = _to_camel(field)
            update_data[key] = data[field]
    if "value" in data:
        update_data["value"] = data["value"]
    if "string_value" in data and data["string_value"] is not None:
        update_data["stringValue"] = data["string_value"]
    if "span_id" in data:
        update_data["spanId"] = data["span_id"]

    score = await prisma.score.update(where={"id": score_id}, data=update_data)
    logger.info("score_updated", score_id=score_id)
    return _serialize(score)


async def delete_score(score_id: str) -> bool:
    """删除 Score"""
    try:
        await prisma.score.delete(where={"id": score_id})
        logger.info("score_deleted", score_id=score_id)
        return True
    except Exception:
        return False


async def list_scores(
    trace_id: Optional[str] = None,
    span_id: Optional[str] = None,
    name: Optional[str] = None,
    source: Optional[str] = None,
    author: Optional[str] = None,
    eval_config_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    """查询 Score 列表，支持过滤和分页"""
    where: Dict[str, Any] = {}
    if trace_id:
        where["traceId"] = trace_id
    if span_id:
        where["spanId"] = span_id
    if name:
        where["name"] = name
    if source:
        where["source"] = source
    if author:
        where["author"] = author
    if eval_config_id:
        where["evalConfigId"] = eval_config_id

    total = await prisma.score.count(where=where)
    skip = (page - 1) * limit
    scores = await prisma.score.find_many(
        where=where,
        skip=skip,
        take=limit,
        order={"createdAt": "desc"},
    )

    return {
        "data": [_serialize(s) for s in scores],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
    }


async def get_trace_scores(trace_id: str) -> List[Dict[str, Any]]:
    """获取某个 Trace 的所有 Score"""
    scores = await prisma.score.find_many(
        where={"traceId": trace_id},
        order={"createdAt": "desc"},
    )
    return [_serialize(s) for s in scores]


async def get_score_stats(
    name: Optional[str] = None,
    source: Optional[str] = None,
    trace_id: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
    """Score 统计聚合（按 name 分组的均值、计数、分布）"""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    where: Dict[str, Any] = {"createdAt": {"gte": cutoff}}
    if name:
        where["name"] = name
    if source:
        where["source"] = source
    if trace_id:
        where["traceId"] = trace_id

    scores = await prisma.score.find_many(where=where, order={"createdAt": "asc"})

    # 按 name 分组统计
    stats: Dict[str, Dict[str, Any]] = {}
    for s in scores:
        n = s.name
        if n not in stats:
            stats[n] = {"name": n, "count": 0, "sum": 0.0, "values": [], "sources": {}}
        stats[n]["count"] += 1
        if s.value is not None:
            stats[n]["sum"] += s.value
            stats[n]["values"].append(s.value)
        src = s.source or "unknown"
        stats[n]["sources"][src] = stats[n]["sources"].get(src, 0) + 1

    # 计算均值和分布
    result = []
    for n, st in stats.items():
        values = st["values"]
        avg = st["sum"] / len(values) if values else None
        # 分布桶
        distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for v in values:
            if v >= 0.8:
                distribution["excellent"] += 1
            elif v >= 0.6:
                distribution["good"] += 1
            elif v >= 0.4:
                distribution["fair"] += 1
            else:
                distribution["poor"] += 1
        result.append({
            "name": n,
            "count": st["count"],
            "average": round(avg, 4) if avg is not None else None,
            "min": round(min(values), 4) if values else None,
            "max": round(max(values), 4) if values else None,
            "distribution": distribution,
            "sources": st["sources"],
        })

    return {"dimensions": result, "total_scores": len(scores)}


def _to_camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _serialize(score) -> Dict[str, Any]:
    if score is None:
        return {}
    return {
        "id": score.id,
        "trace_id": score.traceId,
        "span_id": score.spanId,
        "name": score.name,
        "value": score.value,
        "string_value": score.stringValue,
        "comment": score.comment,
        "source": score.source,
        "author": score.author,
        "eval_config_id": score.evalConfigId,
        "created_at": score.createdAt.isoformat() if score.createdAt else None,
        "updated_at": score.updatedAt.isoformat() if score.updatedAt else None,
    }
