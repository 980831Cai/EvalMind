"""Trace 服务 - 自有 Trace/Span 存储（替代 Langfuse）"""
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from prisma import Json as PrismaJson
from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("trace_service")


def _json_field(value) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
    return PrismaJson(value)


async def create_trace(
    name: str,
    source: str = "eval",
    agent_id: Optional[str] = None,
    input_text: Optional[str] = None,
    output_text: Optional[str] = None,
    status: str = "ok",
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[Dict] = None,
    tags: Optional[List[str]] = None,
    start_time: Optional[datetime] = None,
) -> str:
    """创建一条 Trace 记录，返回 trace_id"""
    trace_id = str(uuid.uuid4())
    now = start_time or datetime.now(timezone.utc)

    data = {
        "id": trace_id,
        "name": name,
        "source": source,
        "status": status,
        "startTime": now,
        "createdAt": now,
    }

    if agent_id:
        data["agent"] = {"connect": {"id": agent_id}}
    if input_text is not None:
        data["input"] = input_text
    if output_text is not None:
        data["output"] = output_text
    if session_id:
        data["sessionId"] = session_id
    if user_id:
        data["userId"] = user_id
    if metadata:
        data["metadata"] = _json_field(metadata)
    if tags:
        data["tags"] = _json_field(tags)

    try:
        await prisma.trace.create(data=data)
        logger.debug("trace_created", trace_id=trace_id, name=name, source=source)
    except Exception as e:
        logger.error("trace_create_failed", trace_id=trace_id, error=str(e))
        raise

    return trace_id


async def end_trace(
    trace_id: str,
    output_text: Optional[str] = None,
    status: str = "ok",
    total_latency_ms: Optional[int] = None,
    total_tokens: Optional[int] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_cost: Optional[float] = None,
    llm_call_count: Optional[int] = None,
    tool_call_count: Optional[int] = None,
    end_time: Optional[datetime] = None,
) -> None:
    """完成一条 Trace（更新输出、统计信息）"""
    now = end_time or datetime.now(timezone.utc)
    update_data: Dict[str, Any] = {
        "endTime": now,
        "status": status,
    }

    if output_text is not None:
        update_data["output"] = output_text
    if total_latency_ms is not None:
        update_data["totalLatencyMs"] = total_latency_ms
    if total_tokens is not None:
        update_data["totalTokens"] = total_tokens
    if prompt_tokens is not None:
        update_data["promptTokens"] = prompt_tokens
    if completion_tokens is not None:
        update_data["completionTokens"] = completion_tokens
    if total_cost is not None:
        update_data["totalCost"] = total_cost
    if llm_call_count is not None:
        update_data["llmCallCount"] = llm_call_count
    if tool_call_count is not None:
        update_data["toolCallCount"] = tool_call_count

    try:
        await prisma.trace.update(where={"id": trace_id}, data=update_data)
        logger.debug("trace_ended", trace_id=trace_id)
    except Exception as e:
        logger.error("trace_end_failed", trace_id=trace_id, error=str(e))


async def create_span(
    trace_id: str,
    name: str,
    kind: str = "other",
    parent_span_id: Optional[str] = None,
    status: str = "ok",
    status_message: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    latency_ms: Optional[int] = None,
    # LLM 属性
    llm_model: Optional[str] = None,
    llm_prompt: Optional[str] = None,
    llm_completion: Optional[str] = None,
    llm_prompt_tokens: Optional[int] = None,
    llm_completion_tokens: Optional[int] = None,
    llm_total_tokens: Optional[int] = None,
    llm_temperature: Optional[float] = None,
    llm_cost: Optional[float] = None,
    llm_finish_reason: Optional[str] = None,
    # 工具属性
    tool_name: Optional[str] = None,
    tool_input: Optional[str] = None,
    tool_output: Optional[str] = None,
    tool_status: Optional[str] = None,
    # 检索属性
    retrieval_query: Optional[str] = None,
    retrieval_doc_count: Optional[int] = None,
    retrieval_documents: Optional[Any] = None,
    # 通用
    input_text: Optional[str] = None,
    output_text: Optional[str] = None,
    attributes: Optional[Dict] = None,
    events: Optional[List[Dict]] = None,
) -> str:
    """创建一个 Span 节点"""
    span_id = str(uuid.uuid4())
    now = start_time or datetime.now(timezone.utc)

    data: Dict[str, Any] = {
        "id": span_id,
        "trace": {"connect": {"id": trace_id}},
        "name": name,
        "kind": kind,
        "status": status,
        "startTime": now,
    }

    if parent_span_id:
        data["parentSpan"] = {"connect": {"id": parent_span_id}}
    if status_message:
        data["statusMessage"] = status_message
    if end_time:
        data["endTime"] = end_time
    if latency_ms is not None:
        data["latencyMs"] = latency_ms

    # LLM
    if llm_model:
        data["llmModel"] = llm_model
    if llm_prompt is not None:
        data["llmPrompt"] = llm_prompt
    if llm_completion is not None:
        data["llmCompletion"] = llm_completion
    if llm_prompt_tokens is not None:
        data["llmPromptTokens"] = llm_prompt_tokens
    if llm_completion_tokens is not None:
        data["llmCompletionTokens"] = llm_completion_tokens
    if llm_total_tokens is not None:
        data["llmTotalTokens"] = llm_total_tokens
    if llm_temperature is not None:
        data["llmTemperature"] = llm_temperature
    if llm_cost is not None:
        data["llmCost"] = llm_cost
    if llm_finish_reason:
        data["llmFinishReason"] = llm_finish_reason

    # Tool
    if tool_name:
        data["toolName"] = tool_name
    if tool_input is not None:
        data["toolInput"] = tool_input
    if tool_output is not None:
        data["toolOutput"] = tool_output
    if tool_status:
        data["toolStatus"] = tool_status

    # Retrieval
    if retrieval_query:
        data["retrievalQuery"] = retrieval_query
    if retrieval_doc_count is not None:
        data["retrievalDocCount"] = retrieval_doc_count
    if retrieval_documents:
        data["retrievalDocuments"] = _json_field(retrieval_documents)

    # Generic
    if input_text is not None:
        data["input"] = input_text
    if output_text is not None:
        data["output"] = output_text
    if attributes:
        data["attributes"] = _json_field(attributes)
    if events:
        data["events"] = _json_field(events)

    try:
        await prisma.span.create(data=data)
        logger.debug("span_created", span_id=span_id, trace_id=trace_id, kind=kind)
    except Exception as e:
        logger.error("span_create_failed", span_id=span_id, error=str(e))
        raise

    return span_id


async def create_eval_trace(
    task_name: str,
    agent_name: str,
    agent_id: Optional[str] = None,
    input_text: str = "",
    output_text: str = "",
    latency_ms: int = 0,
    token_usage: Optional[Dict[str, int]] = None,
    tool_calls: Optional[List[Dict]] = None,
    scores: Optional[Dict[str, float]] = None,
    overall_score: float = 0,
) -> Dict[str, str]:
    """
    为一次评测创建完整的 Trace + Span 记录。
    兼容原 langfuse_service 的接口，方便 eval_engine 迁移。
    """
    try:
        prompt_tokens = (token_usage or {}).get("prompt", 0) or (token_usage or {}).get("prompt_tokens", 0)
        completion_tokens = (token_usage or {}).get("completion", 0) or (token_usage or {}).get("completion_tokens", 0)
        total_tokens = prompt_tokens + completion_tokens
        now = datetime.now(timezone.utc)

        trace_id = await create_trace(
            name=f"eval:{task_name}",
            source="eval",
            agent_id=agent_id,
            input_text=input_text,
            output_text=output_text,
            metadata={
                "agent_name": agent_name,
                "task_name": task_name,
                "scores": scores or {},
                "overall_score": overall_score,
            },
            tags=["eval-platform", agent_name],
        )

        await end_trace(
            trace_id=trace_id,
            output_text=output_text,
            total_latency_ms=latency_ms,
            total_tokens=total_tokens,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            llm_call_count=1,
            tool_call_count=len(tool_calls) if tool_calls else 0,
        )

        # 为每个工具调用创建 Span（批量写入，提升性能）
        if tool_calls:
            span_batch = []
            for i, tc in enumerate(tool_calls):
                t_name = tc.get("name") or tc.get("display_name") or f"tool_{i}"
                t_input = tc.get("arguments") or tc.get("display_name") or f"(tool call #{i+1})"
                t_output = tc.get("result") or "(no result captured)"
                if isinstance(t_input, dict):
                    t_input = json.dumps(t_input, ensure_ascii=False)
                if isinstance(t_output, dict):
                    t_output = json.dumps(t_output, ensure_ascii=False)

                span_data = {
                    "id": str(uuid.uuid4()),
                    "traceId": trace_id,
                    "name": f"tool:{t_name}",
                    "kind": "tool",
                    "status": "ok",
                    "startTime": now,
                    "toolName": t_name,
                    "toolInput": str(t_input),
                    "toolOutput": str(t_output),
                    "toolStatus": "success",
                    "attributes": _json_field({
                        "tool_call_id": tc.get("tool_call_id", ""),
                        "display_name": tc.get("display_name", ""),
                    }),
                }
                span_batch.append(span_data)

            if span_batch:
                try:
                    await prisma.span.create_many(data=span_batch)
                    logger.debug("spans_batch_created", trace_id=trace_id, count=len(span_batch))
                except Exception as e:
                    logger.error("spans_batch_create_failed", trace_id=trace_id, error=str(e))
                    # Fallback: 逐条创建
                    for sd in span_batch:
                        try:
                            await prisma.span.create(data=sd)
                        except Exception as inner_e:
                            logger.error("span_fallback_create_failed", span_id=sd["id"], error=str(inner_e))

        return {"trace_id": trace_id}

    except Exception as e:
        logger.warning("create_eval_trace_failed", error=str(e))
        return {"trace_id": ""}
