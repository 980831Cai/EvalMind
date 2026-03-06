"""数据上报网关 — v4.0
接收外部 SDK 上报的 trace 数据，存入本地 traces/spans 表（替代 Langfuse 转发）
"""
import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging import get_logger
from app.services.trace_service import create_trace, end_trace, create_span
from app.services.online_eval_worker import publish_trace_event

logger = get_logger("ingest")

router = APIRouter(prefix="/ingest", tags=["Ingest"])


async def _verify_ingest_key(x_api_key: Optional[str] = Header(None)):
    """验证 Ingest API Key（如果配置了 INGEST_API_KEY 则强制校验）"""
    if settings.INGEST_API_KEY:
        if not x_api_key or x_api_key != settings.INGEST_API_KEY:
            raise HTTPException(status_code=401, detail="无效的 API Key")


class TraceEvent(BaseModel):
    """单条追踪事件"""
    type: str = "trace"  # trace, span, generation, event
    name: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    metadata: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    # span/generation 特有
    model: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    latency_ms: Optional[int] = None
    token_usage: Optional[Dict[str, int]] = None
    # 嵌套
    parent_id: Optional[str] = None
    trace_id: Optional[str] = None


class IngestBatch(BaseModel):
    """批量上报"""
    agent_id: Optional[str] = None
    events: List[TraceEvent] = []


class IngestResponse(BaseModel):
    received: int
    trace_ids: List[str] = []
    message: str = "ok"


@router.post("", response_model=IngestResponse, dependencies=[Depends(_verify_ingest_key)])
async def ingest_events(data: IngestBatch, x_agent_id: Optional[str] = Header(None)):
    """接收外部 SDK 上报的 trace 数据（需要 X-API-Key 认证）"""
    agent_id = data.agent_id or x_agent_id

    if not data.events:
        return IngestResponse(received=0, trace_ids=[], message="no events")

    trace_ids = []

    try:
        for event in data.events:
            tags = event.tags or []
            if agent_id:
                tags.append(f"agent:{agent_id}")
            tags.append("source:sdk")

            input_str = _to_str(event.input)
            output_str = _to_str(event.output)

            if event.type == "trace":
                tid = await create_trace(
                    name=event.name or "sdk-trace",
                    source="sdk",
                    agent_id=agent_id,
                    input_text=input_str,
                    output_text=output_str,
                    metadata=event.metadata or {},
                    tags=tags,
                )
                trace_ids.append(tid)
                # 发布在线评估事件
                await publish_trace_event(tid, agent_id)

            elif event.type == "generation":
                # generation = LLM 调用，创建 trace + llm span
                tid = await create_trace(
                    name=event.name or "sdk-generation",
                    source="sdk",
                    agent_id=agent_id,
                    input_text=input_str,
                    output_text=output_str,
                    metadata=event.metadata or {},
                    tags=tags,
                )

                prompt_tokens = (event.token_usage or {}).get("prompt", 0) or (event.token_usage or {}).get("prompt_tokens", 0)
                completion_tokens = (event.token_usage or {}).get("completion", 0) or (event.token_usage or {}).get("completion_tokens", 0)
                total_tokens = prompt_tokens + completion_tokens

                await create_span(
                    trace_id=tid,
                    name=event.name or "generation",
                    kind="llm",
                    llm_model=event.model or "unknown",
                    llm_prompt=input_str,
                    llm_completion=output_str,
                    llm_prompt_tokens=prompt_tokens,
                    llm_completion_tokens=completion_tokens,
                    llm_total_tokens=total_tokens,
                    latency_ms=event.latency_ms,
                    input_text=input_str,
                    output_text=output_str,
                )

                await end_trace(
                    trace_id=tid,
                    output_text=output_str,
                    total_tokens=total_tokens,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_latency_ms=event.latency_ms,
                    llm_call_count=1,
                )

                trace_ids.append(tid)
                # 发布在线评估事件
                await publish_trace_event(tid, agent_id)

            elif event.type == "span":
                # 普通 span，需要 trace_id 或自动创建 trace
                tid = event.trace_id
                if not tid:
                    tid = await create_trace(
                        name=event.name or "sdk-span",
                        source="sdk",
                        agent_id=agent_id,
                        input_text=input_str,
                        output_text=output_str,
                        metadata=event.metadata or {},
                        tags=tags,
                    )

                await create_span(
                    trace_id=tid,
                    name=event.name or "span",
                    kind="other",
                    parent_span_id=event.parent_id,
                    latency_ms=event.latency_ms,
                    input_text=input_str,
                    output_text=output_str,
                    attributes=event.metadata,
                )

                if tid not in trace_ids:
                    trace_ids.append(tid)

    except Exception as e:
        logger.error("ingest_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"上报失败: {str(e)}")

    return IngestResponse(
        received=len(data.events),
        trace_ids=trace_ids,
        message="ok",
    )


@router.get("/health")
async def ingest_health():
    """上报网关健康检查"""
    return {"status": "ok", "timestamp": int(time.time() * 1000)}


def _to_str(value: Any) -> Optional[str]:
    """将任意类型转为字符串"""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    import json
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)
