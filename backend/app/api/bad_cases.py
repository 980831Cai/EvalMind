"""Bad Case 管理 API"""
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import prisma
from app.models.pydantic_models import BadCaseCreate, BadCaseUpdate, BadCaseResponse
from app.services.bad_case_service import create_bad_case, import_from_eval_result, export_to_test_suite

router = APIRouter(prefix="/bad-cases", tags=["BadCases"])


@router.post("", response_model=BadCaseResponse)
async def create(data: BadCaseCreate):
    result = await create_bad_case(
        agent_id=data.agent_id,
        input_text=data.input,
        expected_output=data.expected_output,
        actual_output=data.actual_output,
        assertions=[a.model_dump() for a in data.assertions] if data.assertions else None,
        source=data.source,
        eval_result_id=data.eval_result_id,
        tags=data.tags,
        root_cause=data.root_cause,
    )
    record = await prisma.badcase.find_unique(where={"id": result["id"]})
    return _to_response(record)


@router.get("", response_model=List[BadCaseResponse])
async def list_bad_cases(
    agent_id: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 50,
):
    where = {}
    if agent_id:
        where["agentId"] = agent_id
    if status:
        where["status"] = status
    if source:
        where["source"] = source

    records = await prisma.badcase.find_many(
        where=where,
        order={"createdAt": "desc"},
        take=limit,
    )
    return [_to_response(r) for r in records]


# ===== 固定路径路由（必须在 /{bad_case_id} 之前） =====

@router.get("/stats/summary")
async def get_stats():
    """获取 Bad Case 统计"""
    open_count = await prisma.badcase.count(where={"status": "open"})
    investigating = await prisma.badcase.count(where={"status": "investigating"})
    resolved = await prisma.badcase.count(where={"status": "resolved"})
    exported = await prisma.badcase.count(where={"status": "exported"})
    total = open_count + investigating + resolved + exported

    return {
        "total": total,
        "open": open_count,
        "investigating": investigating,
        "resolved": resolved,
        "exported": exported,
    }


class ImportRequest(BaseModel):
    eval_result_id: str
    tags: Optional[List[str]] = None


@router.post("/import", response_model=BadCaseResponse)
async def import_bad_case(data: ImportRequest):
    try:
        result = await import_from_eval_result(data.eval_result_id, data.tags)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    record = await prisma.badcase.find_unique(where={"id": result["id"]})
    return _to_response(record)


class ExportRequest(BaseModel):
    bad_case_ids: List[str]
    test_suite_id: str


class FromTraceRequest(BaseModel):
    """从 Langfuse Trace 创建 Bad Case"""
    agent_id: str
    input: str
    actual_output: Optional[str] = None
    tags: Optional[List[str]] = None
    root_cause: Optional[str] = None


@router.post("/from-trace", response_model=BadCaseResponse)
async def create_from_trace(data: FromTraceRequest):
    """从 Trace 数据直接创建 Bad Case"""
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=400, detail="Agent 不存在")

    result = await create_bad_case(
        agent_id=data.agent_id,
        input_text=data.input,
        expected_output=None,
        actual_output=data.actual_output,
        source="trace",
        tags=data.tags,
        root_cause=data.root_cause,
    )
    record = await prisma.badcase.find_unique(where={"id": result["id"]})
    return _to_response(record)


@router.post("/export")
async def export_bad_cases(data: ExportRequest):
    try:
        count = await export_to_test_suite(data.bad_case_ids, data.test_suite_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": f"已导出 {count} 条到测试套件", "exported_count": count}


# ===== 策略沉淀 =====

class DistillGeneRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    signals_match: Optional[List[str]] = None
    prompt_patch: Optional[str] = None
    tags: Optional[List[str]] = None


class BatchDistillRequest(BaseModel):
    bad_case_ids: List[str]
    merge_similar: bool = True


@router.post("/{bad_case_id}/distill-gene")
async def distill_gene(bad_case_id: str, data: Optional[DistillGeneRequest] = None):
    """从单个 Bad Case 提炼策略基因"""
    from app.services.bad_case_to_gene import distill_gene_from_bad_case
    try:
        overrides = data.model_dump(exclude_unset=True) if data else None
        gene = await distill_gene_from_bad_case(bad_case_id, overrides)
        return gene
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/batch-distill")
async def batch_distill(data: BatchDistillRequest):
    """批量从 Bad Case 提炼策略基因"""
    from app.services.bad_case_to_gene import batch_distill_genes
    result = await batch_distill_genes(data.bad_case_ids, data.merge_similar)
    return result


# ===== 路径参数路由 =====

@router.get("/{bad_case_id}", response_model=BadCaseResponse)
async def get_bad_case(bad_case_id: str):
    record = await prisma.badcase.find_unique(where={"id": bad_case_id})
    if not record:
        raise HTTPException(status_code=404, detail="Bad Case 不存在")
    return _to_response(record)


@router.put("/{bad_case_id}", response_model=BadCaseResponse)
async def update_bad_case(bad_case_id: str, data: BadCaseUpdate):
    record = await prisma.badcase.find_unique(where={"id": bad_case_id})
    if not record:
        raise HTTPException(status_code=404, detail="Bad Case 不存在")

    update_data = {}
    if data.status is not None:
        update_data["status"] = data.status
    if data.tags is not None:
        update_data["tags"] = json.dumps(data.tags)
    if data.root_cause is not None:
        update_data["rootCause"] = data.root_cause
    if data.assertions is not None:
        update_data["assertions"] = json.dumps([a.model_dump() for a in data.assertions])

    updated = await prisma.badcase.update(
        where={"id": bad_case_id},
        data=update_data,
    )
    return _to_response(updated)


@router.delete("/{bad_case_id}")
async def delete_bad_case(bad_case_id: str):
    record = await prisma.badcase.find_unique(where={"id": bad_case_id})
    if not record:
        raise HTTPException(status_code=404, detail="Bad Case 不存在")
    await prisma.badcase.delete(where={"id": bad_case_id})
    return {"message": "已删除"}


def _to_response(record) -> BadCaseResponse:
    tags = record.tags
    if isinstance(tags, str):
        tags = json.loads(tags)
    assertions = record.assertions
    if isinstance(assertions, str):
        assertions = json.loads(assertions)

    return BadCaseResponse(
        id=record.id,
        agent_id=record.agentId,
        input=record.input,
        expected_output=record.expectedOutput,
        actual_output=record.actualOutput,
        assertions=assertions,
        source=record.source,
        eval_result_id=record.evalResultId,
        status=record.status,
        tags=tags if isinstance(tags, list) else None,
        root_cause=record.rootCause,
        created_at=record.createdAt,
        updated_at=record.updatedAt,
    )
