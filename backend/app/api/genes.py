"""策略基因库 API - Gene CRUD、导入导出"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Any

from app.services import gene_service

router = APIRouter(prefix="/genes", tags=["genes"])


class GeneCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    category: str = Field(..., pattern="^(repair|optimize|innovate)$")
    signals_match: List[str] = Field(default_factory=list)
    prompt_patch: str
    source: str = Field(default="manual", pattern="^(bad_case|manual|experiment|import)$")
    source_id: Optional[str] = None
    agent_id: Optional[str] = None
    is_active: bool = True
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None


class GeneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    signals_match: Optional[List[str]] = None
    prompt_patch: Optional[str] = None
    is_active: Optional[bool] = None
    agent_id: Optional[str] = None
    effectiveness: Optional[float] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None


class BatchImport(BaseModel):
    genes: List[GeneCreate]


@router.post("/")
async def create_gene(data: GeneCreate):
    """创建策略基因"""
    gene = await gene_service.create_gene(data.model_dump())
    return gene


@router.get("/")
async def list_genes(
    agent_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    order_by: str = Query("created_at"),
    order_dir: str = Query("desc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """查询策略基因列表"""
    return await gene_service.list_genes(
        agent_id=agent_id,
        category=category,
        source=source,
        is_active=is_active,
        search=search,
        order_by=order_by,
        order_dir=order_dir,
        limit=limit,
        offset=offset,
    )


@router.get("/{gene_id}")
async def get_gene(gene_id: str):
    """获取单个策略基因"""
    gene = await gene_service.get_gene(gene_id)
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")
    return gene


@router.put("/{gene_id}")
async def update_gene(gene_id: str, data: GeneUpdate):
    """更新策略基因"""
    gene = await gene_service.update_gene(gene_id, data.model_dump(exclude_unset=True))
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")
    return gene


@router.delete("/{gene_id}")
async def delete_gene(gene_id: str):
    """删除策略基因"""
    ok = await gene_service.delete_gene(gene_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Gene not found")
    return {"success": True}


@router.post("/import")
async def import_genes(data: BatchImport):
    """批量导入策略基因"""
    result = await gene_service.batch_import_genes([g.model_dump() for g in data.genes])
    return result


@router.get("/export/json")
async def export_genes(
    agent_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    format: str = Query("json", pattern="^(json|gep)$"),
):
    """导出策略基因"""
    genes = await gene_service.export_genes(agent_id=agent_id, category=category, format=format)
    return {"genes": genes, "format": format, "count": len(genes)}


@router.post("/match")
async def match_genes(
    signals: List[str],
    agent_id: Optional[str] = Query(None),
):
    """根据失败信号匹配策略基因"""
    matched = await gene_service.match_genes_by_signals(signals, agent_id)
    return {"matched": matched, "count": len(matched)}
