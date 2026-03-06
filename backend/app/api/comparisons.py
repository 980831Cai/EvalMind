"""跨模型对比 API"""
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException

from app.core.database import prisma
from app.models.pydantic_models import ComparisonRunCreate, ComparisonRunResponse
from app.services.comparison_service import create_comparison

router = APIRouter(prefix="/comparisons", tags=["Comparisons"])


@router.post("", response_model=ComparisonRunResponse)
async def create_comparison_run(data: ComparisonRunCreate):
    try:
        result = await create_comparison(
            name=data.name,
            mode=data.mode,
            test_suite_id=data.test_suite_id,
            template_id=data.template_id,
            agent_id=data.agent_id,
            agent_ids=data.agent_ids,
            model_overrides=data.model_overrides,
            repeat_count=data.repeat_count,
            dimensions=data.dimensions,
            model_config_id=data.model_config_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    record = await prisma.comparisonrun.find_unique(where={"id": result["id"]})
    return _to_response(record)


@router.get("", response_model=List[ComparisonRunResponse])
async def list_comparisons(limit: int = 20):
    records = await prisma.comparisonrun.find_many(
        order={"createdAt": "desc"},
        take=limit,
    )
    return [_to_response(r) for r in records]


@router.get("/{comparison_id}", response_model=ComparisonRunResponse)
async def get_comparison(comparison_id: str):
    record = await prisma.comparisonrun.find_unique(where={"id": comparison_id})
    if not record:
        raise HTTPException(status_code=404, detail="对比运行不存在")
    return _to_response(record)


@router.get("/{comparison_id}/progress")
async def get_comparison_progress(comparison_id: str):
    """获取对比运行中各 eval run 的实时进度"""
    record = await prisma.comparisonrun.find_unique(where={"id": comparison_id})
    if not record:
        raise HTTPException(status_code=404, detail="对比运行不存在")

    eval_run_ids = record.evalRunIds
    if isinstance(eval_run_ids, str):
        eval_run_ids = json.loads(eval_run_ids)

    model_labels = record.modelLabels
    if isinstance(model_labels, str):
        model_labels = json.loads(model_labels)

    repeat_count = record.repeatCount or 1
    progress_items = []
    for i, label in enumerate(model_labels):
        start_idx = i * repeat_count
        run_ids = eval_run_ids[start_idx:start_idx + repeat_count]
        total_progress = 0
        total_items = 0
        completed_items = 0
        statuses = []
        for rid in run_ids:
            run = await prisma.evalrun.find_unique(where={"id": rid})
            if run:
                total_progress += run.progress or 0
                total_items += run.totalItems or 0
                completed_items += run.currentItem or 0
                statuses.append(run.status)
        avg_progress = total_progress / max(len(run_ids), 1)
        progress_items.append({
            "label": label,
            "run_ids": run_ids,
            "progress": round(avg_progress, 1),
            "total_items": total_items,
            "completed_items": completed_items,
            "statuses": statuses,
        })

    return {
        "id": comparison_id,
        "status": record.status,
        "model_progress": progress_items,
    }


@router.delete("/{comparison_id}")
async def delete_comparison(comparison_id: str):
    record = await prisma.comparisonrun.find_unique(where={"id": comparison_id})
    if not record:
        raise HTTPException(status_code=404, detail="对比运行不存在")
    await prisma.comparisonrun.delete(where={"id": comparison_id})
    return {"message": "已删除"}


def _to_response(record) -> ComparisonRunResponse:
    eval_run_ids = record.evalRunIds
    if isinstance(eval_run_ids, str):
        eval_run_ids = json.loads(eval_run_ids)

    model_labels = record.modelLabels
    if isinstance(model_labels, str):
        model_labels = json.loads(model_labels)

    comparison_data = record.comparisonData
    if isinstance(comparison_data, str):
        comparison_data = json.loads(comparison_data)

    return ComparisonRunResponse(
        id=record.id,
        name=record.name,
        mode=record.mode,
        test_suite_id=record.testSuiteId,
        template_id=record.templateId,
        eval_run_ids=eval_run_ids if isinstance(eval_run_ids, list) else [],
        model_labels=model_labels if isinstance(model_labels, list) else [],
        repeat_count=record.repeatCount,
        comparison_data=comparison_data if isinstance(comparison_data, dict) else None,
        status=record.status,
        created_at=record.createdAt,
        updated_at=record.updatedAt,
    )
