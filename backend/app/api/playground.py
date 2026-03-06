"""Playground API — 即时对话调试"""
import json
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import prisma
from app.adapters.factory import create_adapter

router = APIRouter(prefix="/playground", tags=["Playground"])


class ChatRequest(BaseModel):
    agent_id: str
    message: str
    config_overrides: Optional[Dict[str, Any]] = None  # {model, system_prompt, temperature}


class ChatResponse(BaseModel):
    content: str
    thinking: str = ""
    latency_ms: int = 0
    token_usage: Dict[str, int] = {}
    tool_calls: List[Dict[str, Any]] = []
    error: Optional[str] = None


class CompareRequest(BaseModel):
    agent_id: str
    message: str
    configs: List[Dict[str, Any]]  # [{model, system_prompt, temperature, label}, ...]


class CompareItem(BaseModel):
    label: str
    content: str
    thinking: str = ""
    latency_ms: int = 0
    token_usage: Dict[str, int] = {}
    tool_calls: List[Dict[str, Any]] = []
    error: Optional[str] = None


class CompareResponse(BaseModel):
    results: List[CompareItem]


@router.post("/chat", response_model=ChatResponse)
async def playground_chat(data: ChatRequest):
    """Playground 单次对话"""
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    agent_config = agent.agentConfig or {}
    if isinstance(agent_config, str):
        agent_config = json.loads(agent_config)

    # Apply config overrides
    overrides = data.config_overrides or {}
    if overrides.get("model"):
        agent_config["model"] = overrides["model"]
    if overrides.get("system_prompt"):
        agent_config["system_prompt"] = overrides["system_prompt"]
    if overrides.get("temperature") is not None:
        agent_config["temperature"] = overrides["temperature"]

    try:
        adapter = create_adapter(agent.agentType, agent_config)
        model_override = overrides.get("model", "")
        response = await adapter.invoke(data.message, model_override=model_override)

        return ChatResponse(
            content=response.content,
            thinking=response.thinking,
            latency_ms=response.latency_ms,
            token_usage=response.token_usage,
            tool_calls=response.tool_calls,
            error=response.error,
        )
    except Exception as e:
        return ChatResponse(error=str(e))


@router.post("/compare", response_model=CompareResponse)
async def playground_compare(data: CompareRequest):
    """Playground 多配置并排对比"""
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    base_config = agent.agentConfig or {}
    if isinstance(base_config, str):
        base_config = json.loads(base_config)

    results: List[CompareItem] = []

    for cfg in data.configs:
        config = {**base_config}
        label = cfg.get("label", cfg.get("model", "unknown"))
        if cfg.get("model"):
            config["model"] = cfg["model"]
        if cfg.get("system_prompt"):
            config["system_prompt"] = cfg["system_prompt"]
        if cfg.get("temperature") is not None:
            config["temperature"] = cfg["temperature"]

        try:
            adapter = create_adapter(agent.agentType, config)
            model_override = cfg.get("model", "")
            response = await adapter.invoke(data.message, model_override=model_override)
            results.append(CompareItem(
                label=label,
                content=response.content,
                thinking=response.thinking,
                latency_ms=response.latency_ms,
                token_usage=response.token_usage,
                tool_calls=response.tool_calls,
                error=response.error,
            ))
        except Exception as e:
            results.append(CompareItem(label=label, error=str(e)))

    return CompareResponse(results=results)
