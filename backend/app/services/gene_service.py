"""策略基因库核心服务 - Gene CRUD、匹配查询、有效性更新"""
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.core.database import get_db

logger = logging.getLogger("gene_service")


async def create_gene(data: Dict[str, Any]) -> Dict[str, Any]:
    """创建一个新的策略基因"""
    db = get_db()
    gene = await db.gene.create(
        data={
            "name": data["name"],
            "description": data.get("description"),
            "category": data["category"],
            "signalsMatch": json.dumps(data.get("signals_match", [])),
            "promptPatch": data["prompt_patch"],
            "source": data.get("source", "manual"),
            "sourceId": data.get("source_id"),
            "agentId": data.get("agent_id"),
            "isActive": data.get("is_active", True),
            "tags": json.dumps(data.get("tags", [])) if data.get("tags") else None,
            "metadata": json.dumps(data.get("metadata", {})) if data.get("metadata") else None,
        }
    )
    logger.info(f"Gene created: {gene.id} ({gene.name}), source={gene.source}")
    return _format_gene(gene)


async def list_genes(
    agent_id: Optional[str] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    order_by: str = "created_at",
    order_dir: str = "desc",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """查询策略基因列表"""
    db = get_db()
    where: Dict[str, Any] = {}

    if agent_id is not None:
        where["agentId"] = agent_id
    if category:
        where["category"] = category
    if source:
        where["source"] = source
    if is_active is not None:
        where["isActive"] = is_active
    if search:
        where["OR"] = [
            {"name": {"contains": search}},
            {"description": {"contains": search}},
        ]

    # 排序
    allowed_order = {"created_at": "createdAt", "effectiveness": "effectiveness", "usage_count": "usageCount", "name": "name"}
    prisma_order_field = allowed_order.get(order_by, "createdAt")
    order = {prisma_order_field: order_dir if order_dir in ("asc", "desc") else "desc"}

    total = await db.gene.count(where=where)
    genes = await db.gene.find_many(
        where=where,
        order=order,
        skip=offset,
        take=limit,
    )

    return {
        "items": [_format_gene(g) for g in genes],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


async def get_gene(gene_id: str) -> Optional[Dict[str, Any]]:
    """获取单个策略基因"""
    db = get_db()
    gene = await db.gene.find_unique(where={"id": gene_id})
    if not gene:
        return None
    return _format_gene(gene)


async def update_gene(gene_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """更新策略基因"""
    db = get_db()
    update_data: Dict[str, Any] = {}

    field_map = {
        "name": "name",
        "description": "description",
        "category": "category",
        "prompt_patch": "promptPatch",
        "is_active": "isActive",
        "agent_id": "agentId",
        "effectiveness": "effectiveness",
    }
    for key, prisma_key in field_map.items():
        if key in data:
            update_data[prisma_key] = data[key]

    if "signals_match" in data:
        update_data["signalsMatch"] = json.dumps(data["signals_match"])
    if "tags" in data:
        update_data["tags"] = json.dumps(data["tags"]) if data["tags"] else None
    if "metadata" in data:
        update_data["metadata"] = json.dumps(data["metadata"]) if data["metadata"] else None

    if not update_data:
        return await get_gene(gene_id)

    gene = await db.gene.update(where={"id": gene_id}, data=update_data)
    logger.info(f"Gene updated: {gene.id} ({gene.name})")
    return _format_gene(gene)


async def delete_gene(gene_id: str) -> bool:
    """删除策略基因"""
    db = get_db()
    try:
        await db.gene.delete(where={"id": gene_id})
        logger.info(f"Gene deleted: {gene_id}")
        return True
    except Exception:
        return False


async def increment_usage(gene_id: str) -> None:
    """增加使用次数"""
    db = get_db()
    await db.gene.update(
        where={"id": gene_id},
        data={"usageCount": {"increment": 1}},
    )


async def match_genes_by_signals(signals: List[str], agent_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """根据失败信号匹配可用的策略基因"""
    db = get_db()
    where: Dict[str, Any] = {"isActive": True}
    if agent_id:
        where["OR"] = [{"agentId": agent_id}, {"agentId": None}]

    genes = await db.gene.find_many(where=where, order={"effectiveness": "desc"})

    matched = []
    for gene in genes:
        try:
            gene_signals = json.loads(gene.signalsMatch) if isinstance(gene.signalsMatch, str) else gene.signalsMatch
        except (json.JSONDecodeError, TypeError):
            gene_signals = []
        if any(s in gene_signals for s in signals):
            matched.append(_format_gene(gene))

    return matched


async def batch_import_genes(genes_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """批量导入策略基因"""
    created = 0
    errors = []
    for i, data in enumerate(genes_data):
        try:
            await create_gene(data)
            created += 1
        except Exception as e:
            errors.append({"index": i, "error": str(e)})

    return {"created": created, "errors": errors}


async def export_genes(
    agent_id: Optional[str] = None,
    category: Optional[str] = None,
    format: str = "json",
) -> List[Dict[str, Any]]:
    """导出策略基因"""
    result = await list_genes(agent_id=agent_id, category=category, limit=10000)
    items = result["items"]

    if format == "gep":
        return [_to_gep_format(g) for g in items]
    return items


def _format_gene(gene) -> Dict[str, Any]:
    """格式化 Gene 模型为字典"""
    try:
        signals = json.loads(gene.signalsMatch) if isinstance(gene.signalsMatch, str) else gene.signalsMatch
    except (json.JSONDecodeError, TypeError):
        signals = []
    try:
        tags = json.loads(gene.tags) if isinstance(gene.tags, str) else gene.tags
    except (json.JSONDecodeError, TypeError):
        tags = None
    try:
        metadata = json.loads(gene.metadata) if isinstance(gene.metadata, str) else gene.metadata
    except (json.JSONDecodeError, TypeError):
        metadata = None

    return {
        "id": gene.id,
        "name": gene.name,
        "description": gene.description,
        "category": gene.category,
        "signals_match": signals or [],
        "prompt_patch": gene.promptPatch,
        "source": gene.source,
        "source_id": gene.sourceId,
        "agent_id": gene.agentId,
        "is_active": gene.isActive,
        "effectiveness": gene.effectiveness or 0,
        "usage_count": gene.usageCount,
        "tags": tags or [],
        "metadata": metadata,
        "created_at": gene.createdAt.isoformat() if gene.createdAt else None,
        "updated_at": gene.updatedAt.isoformat() if gene.updatedAt else None,
    }


def _to_gep_format(gene_dict: Dict[str, Any]) -> Dict[str, Any]:
    """转换为 GEP 兼容格式"""
    return {
        "type": "Gene",
        "schema_version": "1.5.0",
        "category": gene_dict["category"],
        "signals_match": gene_dict["signals_match"],
        "summary": gene_dict["description"] or gene_dict["name"],
        "prompt_patch": gene_dict["prompt_patch"],
        "validation": [],
        "asset_id": f"local:{gene_dict['id']}",
        "metadata": {
            "source": gene_dict["source"],
            "effectiveness": gene_dict["effectiveness"],
            "usage_count": gene_dict["usage_count"],
        },
    }
