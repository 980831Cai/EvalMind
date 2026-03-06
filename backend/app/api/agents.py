"""Agent 管理 API"""
import json
from typing import List
from fastapi import APIRouter, HTTPException

from app.core.database import prisma
from app.models.pydantic_models import AgentCreate, AgentUpdate, AgentResponse
from app.adapters.factory import create_adapter

router = APIRouter(prefix="/agents", tags=["Agents"])


def _to_response(record) -> AgentResponse:
    return AgentResponse(
        id=record.id,
        name=record.name,
        description=record.description,
        system_prompt=record.systemPrompt,
        skills=record.skills if record.skills else None,
        mcp_config=record.mcpConfig if record.mcpConfig else None,
        agent_type=record.agentType,
        agent_config=record.agentConfig if record.agentConfig else None,
        tags=record.tags if record.tags else None,
        metadata=record.metadata if record.metadata else None,
        created_at=record.createdAt,
        updated_at=record.updatedAt,
    )


@router.post("", response_model=AgentResponse)
async def create_agent(data: AgentCreate):
    config = data.agent_config or {}
    try:
        create_adapter(data.agent_type, config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    skills_data = [s.model_dump() for s in data.skills] if data.skills else None

    create_data: dict = {
        "name": data.name,
        "description": data.description or "",
        "agentType": data.agent_type,
    }
    if data.system_prompt:
        create_data["systemPrompt"] = data.system_prompt
    if skills_data:
        create_data["skills"] = json.dumps(skills_data)
    if data.mcp_config:
        create_data["mcpConfig"] = json.dumps(data.mcp_config)
    if config:
        create_data["agentConfig"] = json.dumps(config)
    if data.tags:
        create_data["tags"] = json.dumps(data.tags)
    if data.metadata:
        create_data["metadata"] = json.dumps(data.metadata)

    record = await prisma.agent.create(data=create_data)
    return _to_response(record)


@router.get("", response_model=List[AgentResponse])
async def list_agents():
    records = await prisma.agent.find_many(order={"createdAt": "desc"})
    return [_to_response(r) for r in records]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    record = await prisma.agent.find_unique(where={"id": agent_id})
    if not record:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return _to_response(record)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, data: AgentUpdate):
    record = await prisma.agent.find_unique(where={"id": agent_id})
    if not record:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.system_prompt is not None:
        update_data["systemPrompt"] = data.system_prompt
    if data.skills is not None:
        update_data["skills"] = json.dumps([s.model_dump() for s in data.skills])
    if data.mcp_config is not None:
        update_data["mcpConfig"] = json.dumps(data.mcp_config)
    if data.agent_type is not None:
        update_data["agentType"] = data.agent_type
    if data.agent_config is not None:
        update_data["agentConfig"] = json.dumps(data.agent_config)
    if data.tags is not None:
        update_data["tags"] = json.dumps(data.tags)
    if data.metadata is not None:
        update_data["metadata"] = json.dumps(data.metadata)

    updated = await prisma.agent.update(where={"id": agent_id}, data=update_data)
    return _to_response(updated)


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    record = await prisma.agent.find_unique(where={"id": agent_id})
    if not record:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    await prisma.agent.delete(where={"id": agent_id})
    return {"message": "已删除"}


@router.post("/{agent_id}/test")
async def test_agent(agent_id: str):
    record = await prisma.agent.find_unique(where={"id": agent_id})
    if not record:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    raw_config = record.agentConfig if record.agentConfig else {}
    # Prisma Json field may return str or dict depending on driver
    if isinstance(raw_config, str):
        import json as _json
        raw_config = _json.loads(raw_config)
    config = raw_config if isinstance(raw_config, dict) else {}
    adapter = create_adapter(record.agentType, config)
    resp = await adapter.invoke("你好，请简单介绍一下你自己（用一句话）")

    if resp.error:
        return {"success": False, "error": resp.error, "latency_ms": resp.latency_ms}
    return {
        "success": True,
        "content": resp.content[:500],
        "latency_ms": resp.latency_ms,
        "token_usage": resp.token_usage,
    }
