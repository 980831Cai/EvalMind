"""模型配置管理 API"""
import httpx
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException

from app.core.database import prisma
from app.models.pydantic_models import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse

router = APIRouter(prefix="/model-configs", tags=["ModelConfig"])


def _mask_api_key(key: str) -> str:
    if not key or len(key) < 8:
        return "****"
    return key[:4] + "****" + key[-4:]


def _to_response(record) -> ModelConfigResponse:
    return ModelConfigResponse(
        id=record.id,
        name=record.name,
        provider=record.provider,
        model_name=record.modelName,
        base_url=record.baseUrl,
        api_key=_mask_api_key(record.apiKey),
        temperature=record.temperature,
        max_tokens=record.maxTokens,
        top_p=record.topP,
        config=record.config,
        is_active=record.isActive,
        last_tested_at=record.lastTestedAt,
        test_status=record.testStatus,
        created_at=record.createdAt,
        updated_at=record.updatedAt,
    )


@router.post("", response_model=ModelConfigResponse)
async def create_model_config(data: ModelConfigCreate):
    create_data: dict = {
        "name": data.name,
        "provider": data.provider,
        "modelName": data.model_name,
        "baseUrl": data.base_url,
        "apiKey": data.api_key,
    }
    if data.temperature is not None:
        create_data["temperature"] = data.temperature
    if data.max_tokens is not None:
        create_data["maxTokens"] = data.max_tokens
    if data.top_p is not None:
        create_data["topP"] = data.top_p
    if data.config is not None:
        create_data["config"] = data.config
    record = await prisma.modelconfig.create(data=create_data)
    return _to_response(record)


@router.get("", response_model=List[ModelConfigResponse])
async def list_model_configs():
    records = await prisma.modelconfig.find_many(order={"createdAt": "desc"})
    return [_to_response(r) for r in records]


@router.get("/{config_id}", response_model=ModelConfigResponse)
async def get_model_config(config_id: str):
    record = await prisma.modelconfig.find_unique(where={"id": config_id})
    if not record:
        raise HTTPException(status_code=404, detail="模型配置不存在")
    return _to_response(record)


@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(config_id: str, data: ModelConfigUpdate):
    record = await prisma.modelconfig.find_unique(where={"id": config_id})
    if not record:
        raise HTTPException(status_code=404, detail="模型配置不存在")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.provider is not None:
        update_data["provider"] = data.provider
    if data.model_name is not None:
        update_data["modelName"] = data.model_name
    if data.base_url is not None:
        update_data["baseUrl"] = data.base_url
    if data.api_key is not None:
        update_data["apiKey"] = data.api_key
    if data.temperature is not None:
        update_data["temperature"] = data.temperature
    if data.max_tokens is not None:
        update_data["maxTokens"] = data.max_tokens
    if data.top_p is not None:
        update_data["topP"] = data.top_p
    if data.config is not None:
        update_data["config"] = data.config
    if data.is_active is not None:
        update_data["isActive"] = data.is_active

    updated = await prisma.modelconfig.update(where={"id": config_id}, data=update_data)
    return _to_response(updated)


@router.delete("/{config_id}")
async def delete_model_config(config_id: str):
    record = await prisma.modelconfig.find_unique(where={"id": config_id})
    if not record:
        raise HTTPException(status_code=404, detail="模型配置不存在")
    await prisma.modelconfig.delete(where={"id": config_id})
    return {"message": "已删除"}


@router.post("/{config_id}/test")
async def test_model_config(config_id: str):
    record = await prisma.modelconfig.find_unique(where={"id": config_id})
    if not record:
        raise HTTPException(status_code=404, detail="模型配置不存在")

    start = datetime.now()
    status = "success"
    error_msg = None
    content = None

    try:
        url = record.baseUrl.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {record.apiKey}", "Content-Type": "application/json"}
        payload = {
            "model": record.modelName,
            "messages": [{"role": "user", "content": "Hello, respond with 'OK' only."}],
            "max_tokens": 10,
            "temperature": 0,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        status = "failed"
        error_msg = str(e)

    latency_ms = int((datetime.now() - start).total_seconds() * 1000)

    await prisma.modelconfig.update(
        where={"id": config_id},
        data={"lastTestedAt": datetime.now(), "testStatus": status},
    )

    return {"success": status == "success", "content": content, "error": error_msg, "latency_ms": latency_ms}


@router.post("/{config_id}/activate")
async def toggle_activate(config_id: str):
    record = await prisma.modelconfig.find_unique(where={"id": config_id})
    if not record:
        raise HTTPException(status_code=404, detail="模型配置不存在")
    updated = await prisma.modelconfig.update(
        where={"id": config_id},
        data={"isActive": not record.isActive},
    )
    return {"is_active": updated.isActive}
