"""评估框架 API：模板和维度管理"""
import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException

from app.core.database import prisma
from app.models.pydantic_models import (
    EvalTemplateCreate, EvalTemplateUpdate, EvalTemplateResponse,
    EvalDimensionResponse,
)

router = APIRouter(prefix="/eval-framework", tags=["EvalFramework"])


# ===== 模板 CRUD =====

@router.get("/templates", response_model=List[EvalTemplateResponse])
async def list_templates(category: Optional[str] = None):
    where = {}
    if category:
        where["category"] = category
    records = await prisma.evaltemplate.find_many(
        where=where,
        order={"createdAt": "asc"},
    )
    return [_to_template_response(r) for r in records]


@router.get("/templates/{template_id}", response_model=EvalTemplateResponse)
async def get_template(template_id: str):
    record = await prisma.evaltemplate.find_unique(where={"id": template_id})
    if not record:
        raise HTTPException(status_code=404, detail="模板不存在")
    return _to_template_response(record)


@router.post("/templates", response_model=EvalTemplateResponse)
async def create_template(data: EvalTemplateCreate):
    record = await prisma.evaltemplate.create(
        data={
            "id": str(uuid.uuid4()),
            "name": data.name,
            "category": data.category,
            "description": data.description,
            "isBuiltin": False,
            "dimensionConfig": json.dumps(data.dimension_config),
        }
    )
    return _to_template_response(record)


@router.put("/templates/{template_id}", response_model=EvalTemplateResponse)
async def update_template(template_id: str, data: EvalTemplateUpdate):
    record = await prisma.evaltemplate.find_unique(where={"id": template_id})
    if not record:
        raise HTTPException(status_code=404, detail="模板不存在")
    if record.isBuiltin:
        raise HTTPException(status_code=400, detail="内置模板不可修改")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.category is not None:
        update_data["category"] = data.category
    if data.description is not None:
        update_data["description"] = data.description
    if data.dimension_config is not None:
        update_data["dimensionConfig"] = json.dumps(data.dimension_config)

    updated = await prisma.evaltemplate.update(
        where={"id": template_id},
        data=update_data,
    )
    return _to_template_response(updated)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    record = await prisma.evaltemplate.find_unique(where={"id": template_id})
    if not record:
        raise HTTPException(status_code=404, detail="模板不存在")
    if record.isBuiltin:
        raise HTTPException(status_code=400, detail="内置模板不可删除")
    # 清理引用此模板的 EvalRun，避免悬挂引用
    await prisma.evalrun.update_many(
        where={"templateId": template_id},
        data={"templateId": None},
    )
    await prisma.evaltemplate.delete(where={"id": template_id})
    return {"message": "已删除"}


@router.post("/templates/{template_id}/copy", response_model=EvalTemplateResponse)
async def copy_template(template_id: str):
    record = await prisma.evaltemplate.find_unique(where={"id": template_id})
    if not record:
        raise HTTPException(status_code=404, detail="模板不存在")

    new_record = await prisma.evaltemplate.create(
        data={
            "id": str(uuid.uuid4()),
            "name": f"{record.name} (副本)",
            "category": record.category,
            "description": record.description,
            "isBuiltin": False,
            "dimensionConfig": record.dimensionConfig if isinstance(record.dimensionConfig, str) else json.dumps(record.dimensionConfig),
        }
    )
    return _to_template_response(new_record)


# ===== 维度管理 =====

@router.get("/dimensions", response_model=List[EvalDimensionResponse])
async def list_dimensions(layer: Optional[str] = None):
    where = {}
    if layer:
        where["layer"] = layer
    records = await prisma.evaldimension.find_many(
        where=where,
        order={"name": "asc"},
    )
    return [_to_dimension_response(r) for r in records]


@router.get("/dimensions/{dimension_id}", response_model=EvalDimensionResponse)
async def get_dimension(dimension_id: str):
    record = await prisma.evaldimension.find_unique(where={"id": dimension_id})
    if not record:
        raise HTTPException(status_code=404, detail="维度不存在")
    return _to_dimension_response(record)


# ===== Seed =====

@router.post("/seed")
async def seed_data():
    from app.services.seed_dimensions import seed_all
    await seed_all()
    return {"message": "Seed 数据已初始化"}


# ===== Helpers =====

def _to_template_response(record) -> EvalTemplateResponse:
    dim_config = record.dimensionConfig
    if isinstance(dim_config, str):
        dim_config = json.loads(dim_config)
    return EvalTemplateResponse(
        id=record.id,
        name=record.name,
        category=record.category,
        description=record.description,
        is_builtin=record.isBuiltin,
        dimension_config=dim_config if isinstance(dim_config, list) else [],
        created_at=record.createdAt,
        updated_at=record.updatedAt,
    )


def _to_dimension_response(record) -> EvalDimensionResponse:
    return EvalDimensionResponse(
        id=record.id,
        name=record.name,
        display_name=record.displayName,
        description=record.description,
        layer=record.layer,
        scoring_method=record.scoringMethod,
        scoring_criteria=record.scoringCriteria,
        evaluation_steps=record.evaluationSteps,
        weight=record.weight,
        requires_reference=record.requiresReference if hasattr(record, 'requiresReference') else True,
    )
