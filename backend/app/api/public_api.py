"""Public REST API v2 — 简洁的 RESTful 数据上报和查询接口

设计原则：
- 一个 POST 做一件事（不需要 batch 包装）
- 任何语言用 HTTP 即可接入（curl/requests/fetch/http.Client）
- 返回格式统一、简洁

接入示例（curl）：
  curl -X POST http://localhost:8000/api/v2/traces \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: your-key" \\
    -d '{"name": "用户问答", "agent_id": "my-agent", "input": "hello", "output": "hi"}'

接入示例（Python）：
  import requests
  requests.post("http://localhost:8000/api/v2/traces",
      json={"name": "chat", "agent_id": "my-agent", "input": "hello", "output": "hi"},
      headers={"X-API-Key": "your-key"})
"""
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Depends, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.services.trace_service import create_trace, end_trace, create_span
from app.services.online_eval_worker import publish_trace_event

logger = get_logger("public_api")

router = APIRouter(prefix="/v2", tags=["Public API v2"])


# ─── 认证 ──────────────────────────────────────────

async def _verify_api_key(x_api_key: Optional[str] = Header(None)):
    """验证 API Key（如果配置了 INGEST_API_KEY 则强制校验）"""
    if settings.INGEST_API_KEY:
        if not x_api_key or x_api_key != settings.INGEST_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API Key")


# ─── 请求模型 ──────────────────────────────────────

class CreateTraceRequest(BaseModel):
    """创建 Trace 请求"""
    name: str = Field(..., description="Trace 名称", examples=["用户问答", "report-analysis"])
    agent_id: Optional[str] = Field(None, description="关联的 Agent ID（在平台上注册的）")
    input: Optional[Any] = Field(None, description="输入内容（字符串或 JSON）")
    output: Optional[Any] = Field(None, description="输出内容（字符串或 JSON）")
    metadata: Optional[Dict[str, Any]] = Field(None, description="自定义元数据")
    tags: Optional[List[str]] = Field(None, description="标签列表")
    session_id: Optional[str] = Field(None, description="会话 ID（多轮对话）")
    user_id: Optional[str] = Field(None, description="终端用户 ID")
    status: Optional[str] = Field("ok", description="状态：ok / error")
    latency_ms: Optional[int] = Field(None, description="总延迟（毫秒）")
    token_usage: Optional[Dict[str, int]] = Field(None, description="Token 用量", examples=[{"prompt_tokens": 100, "completion_tokens": 200}])

    model_config = {"json_schema_extra": {
        "examples": [{
            "name": "用户问答",
            "agent_id": "my-agent",
            "input": "今天天气怎么样",
            "output": "今天北京晴天，气温25度",
            "metadata": {"user_id": "u123"},
            "latency_ms": 1200
        }]
    }}


class CreateSpanRequest(BaseModel):
    """创建 Span 请求"""
    name: str = Field(..., description="Span 名称")
    kind: str = Field("other", description="类型：llm / tool / retrieval / agent / chain / other")
    parent_span_id: Optional[str] = Field(None, description="父 Span ID（用于嵌套）")
    input: Optional[Any] = Field(None, description="输入")
    output: Optional[Any] = Field(None, description="输出")
    status: Optional[str] = Field("ok", description="状态")
    latency_ms: Optional[int] = Field(None, description="延迟（毫秒）")
    # LLM 相关
    model: Optional[str] = Field(None, description="LLM 模型名（kind=llm 时使用）")
    token_usage: Optional[Dict[str, int]] = Field(None, description="Token 用量")
    temperature: Optional[float] = Field(None, description="温度参数")
    # 工具相关
    tool_name: Optional[str] = Field(None, description="工具名（kind=tool 时使用）")
    # 通用
    metadata: Optional[Dict[str, Any]] = Field(None, description="自定义属性")


class CreateGenerationRequest(BaseModel):
    """创建 Generation 请求（快捷端点：一步创建 Trace + LLM Span）"""
    name: str = Field("generation", description="名称")
    agent_id: Optional[str] = Field(None, description="关联的 Agent ID")
    model: str = Field(..., description="LLM 模型名", examples=["gpt-4", "deepseek-v3"])
    input: Optional[Any] = Field(None, description="Prompt / 输入消息")
    output: Optional[Any] = Field(None, description="模型输出")
    latency_ms: Optional[int] = Field(None, description="延迟（毫秒）")
    token_usage: Optional[Dict[str, int]] = Field(None, description="Token 用量")
    temperature: Optional[float] = Field(None, description="温度参数")
    metadata: Optional[Dict[str, Any]] = Field(None, description="自定义元数据")
    tags: Optional[List[str]] = Field(None, description="标签")


class CreateScoreRequest(BaseModel):
    """创建 Score 请求"""
    name: str = Field(..., description="评分维度名称", examples=["accuracy", "user_satisfaction"])
    value: Optional[float] = Field(None, description="数值分（0-1）")
    string_value: Optional[str] = Field(None, description="分类值", examples=["positive", "negative"])
    comment: Optional[str] = Field(None, description="评分说明")
    span_id: Optional[str] = Field(None, description="关联的 Span ID（可选，精确到 Span 级）")
    source: str = Field("api", description="来源：api / sdk / manual / automated")


class CreateWebhookRequest(BaseModel):
    """Webhook 数据接收"""
    data: Dict[str, Any] = Field(..., description="原始数据（任意 JSON）")


# ─── 响应模型 ──────────────────────────────────────

class TraceResponse(BaseModel):
    id: str
    message: str = "ok"


class SpanResponse(BaseModel):
    id: str
    trace_id: str
    message: str = "ok"


class ScoreResponse(BaseModel):
    id: str
    trace_id: str
    message: str = "ok"


# ─── 工具函数 ──────────────────────────────────────

def _to_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


# ─── 写入端点 ──────────────────────────────────────

@router.post(
    "/traces",
    response_model=TraceResponse,
    summary="创建 Trace",
    description="创建一条完整的 Trace 记录。这是最核心的接入端点。",
    dependencies=[Depends(_verify_api_key)],
)
async def create_trace_v2(data: CreateTraceRequest):
    """创建一条 Trace。

    **使用场景**：
    - 记录一次 Agent 调用（无论 Agent 是自己写的还是 HTTP API）
    - 记录一次用户交互
    - 记录一次评测结果

    **示例（curl）**：
    ```
    curl -X POST http://localhost:8000/api/v2/traces \\
      -H "Content-Type: application/json" \\
      -H "X-API-Key: your-key" \\
      -d '{"name": "chat", "input": "hello", "output": "hi"}'
    ```
    """
    try:
        input_str = _to_str(data.input)
        output_str = _to_str(data.output)

        tags = data.tags or []
        if data.agent_id:
            tags.append(f"agent:{data.agent_id}")
        tags.append("source:api")

        trace_id = await create_trace(
            name=data.name,
            source="api",
            agent_id=data.agent_id,
            input_text=input_str,
            output_text=output_str,
            metadata=data.metadata or {},
            tags=tags,
            session_id=data.session_id,
            user_id=data.user_id,
            status=data.status or "ok",
        )

        # 如果有 output 和 latency，直接 end trace
        if output_str or data.latency_ms or data.token_usage:
            prompt_tokens = (data.token_usage or {}).get("prompt_tokens", 0)
            completion_tokens = (data.token_usage or {}).get("completion_tokens", 0)
            total_tokens = prompt_tokens + completion_tokens

            await end_trace(
                trace_id=trace_id,
                output_text=output_str,
                total_latency_ms=data.latency_ms,
                total_tokens=total_tokens if total_tokens > 0 else None,
                prompt_tokens=prompt_tokens if prompt_tokens > 0 else None,
                completion_tokens=completion_tokens if completion_tokens > 0 else None,
            )

        # 触发在线评估
        await publish_trace_event(trace_id, data.agent_id)

        return TraceResponse(id=trace_id)

    except Exception as e:
        logger.error("v2_create_trace_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"创建 Trace 失败: {str(e)}")


@router.post(
    "/traces/{trace_id}/spans",
    response_model=SpanResponse,
    summary="创建 Span",
    description="为已有的 Trace 添加一个子步骤（Span）。",
    dependencies=[Depends(_verify_api_key)],
)
async def create_span_v2(trace_id: str, data: CreateSpanRequest):
    """为指定 Trace 创建一个 Span。

    Span 代表 Trace 中的一个子步骤，如 LLM 调用、工具调用、检索等。
    """
    try:
        input_str = _to_str(data.input)
        output_str = _to_str(data.output)

        prompt_tokens = (data.token_usage or {}).get("prompt_tokens", 0)
        completion_tokens = (data.token_usage or {}).get("completion_tokens", 0)
        total_tokens = prompt_tokens + completion_tokens

        span_id = await create_span(
            trace_id=trace_id,
            name=data.name,
            kind=data.kind,
            parent_span_id=data.parent_span_id,
            status=data.status or "ok",
            latency_ms=data.latency_ms,
            input_text=input_str,
            output_text=output_str,
            attributes=data.metadata,
            # LLM 字段
            llm_model=data.model,
            llm_prompt=input_str if data.kind == "llm" else None,
            llm_completion=output_str if data.kind == "llm" else None,
            llm_prompt_tokens=prompt_tokens if prompt_tokens > 0 else None,
            llm_completion_tokens=completion_tokens if completion_tokens > 0 else None,
            llm_total_tokens=total_tokens if total_tokens > 0 else None,
            llm_temperature=data.temperature,
            # Tool 字段
            tool_name=data.tool_name,
            tool_input=input_str if data.kind == "tool" else None,
            tool_output=output_str if data.kind == "tool" else None,
        )

        return SpanResponse(id=span_id, trace_id=trace_id)

    except Exception as e:
        logger.error("v2_create_span_failed", trace_id=trace_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"创建 Span 失败: {str(e)}")


@router.post(
    "/generations",
    response_model=TraceResponse,
    summary="创建 Generation（快捷端点）",
    description="一步创建 Trace + LLM Span。适用于记录单次 LLM 调用。",
    dependencies=[Depends(_verify_api_key)],
)
async def create_generation_v2(data: CreateGenerationRequest):
    """创建一条 Generation（= Trace + LLM Span）。

    这是一个快捷端点，适用于最常见的场景：记录一次 LLM 调用。
    """
    try:
        input_str = _to_str(data.input)
        output_str = _to_str(data.output)

        tags = data.tags or []
        if data.agent_id:
            tags.append(f"agent:{data.agent_id}")
        tags.append("source:api")

        prompt_tokens = (data.token_usage or {}).get("prompt_tokens", 0)
        completion_tokens = (data.token_usage or {}).get("completion_tokens", 0)
        total_tokens = prompt_tokens + completion_tokens

        # 创建 Trace
        trace_id = await create_trace(
            name=data.name,
            source="api",
            agent_id=data.agent_id,
            input_text=input_str,
            output_text=output_str,
            metadata=data.metadata or {},
            tags=tags,
        )

        # 创建 LLM Span
        await create_span(
            trace_id=trace_id,
            name=data.name,
            kind="llm",
            llm_model=data.model,
            llm_prompt=input_str,
            llm_completion=output_str,
            llm_prompt_tokens=prompt_tokens if prompt_tokens > 0 else None,
            llm_completion_tokens=completion_tokens if completion_tokens > 0 else None,
            llm_total_tokens=total_tokens if total_tokens > 0 else None,
            llm_temperature=data.temperature,
            latency_ms=data.latency_ms,
            input_text=input_str,
            output_text=output_str,
        )

        # End Trace
        await end_trace(
            trace_id=trace_id,
            output_text=output_str,
            total_latency_ms=data.latency_ms,
            total_tokens=total_tokens if total_tokens > 0 else None,
            prompt_tokens=prompt_tokens if prompt_tokens > 0 else None,
            completion_tokens=completion_tokens if completion_tokens > 0 else None,
            llm_call_count=1,
        )

        # 触发在线评估
        await publish_trace_event(trace_id, data.agent_id)

        return TraceResponse(id=trace_id)

    except Exception as e:
        logger.error("v2_create_generation_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"创建 Generation 失败: {str(e)}")


@router.post(
    "/traces/{trace_id}/scores",
    response_model=ScoreResponse,
    summary="上报 Score",
    description="为指定 Trace 上报一条评分。",
    dependencies=[Depends(_verify_api_key)],
)
async def create_score_v2(trace_id: str, data: CreateScoreRequest):
    """为指定 Trace 创建一条 Score。

    支持数值型（value）和分类型（string_value）两种评分方式。
    """
    from app.core.database import prisma
    from prisma import Json as PrismaJson
    import uuid

    try:
        score_data: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "trace": {"connect": {"id": trace_id}},
            "name": data.name,
            "source": data.source,
        }

        if data.value is not None:
            score_data["value"] = data.value
        if data.string_value is not None:
            score_data["stringValue"] = data.string_value
        if data.comment:
            score_data["comment"] = data.comment
        if data.span_id:
            score_data["spanId"] = data.span_id

        score = await prisma.score.create(data=score_data)

        return ScoreResponse(id=score.id, trace_id=trace_id)

    except Exception as e:
        logger.error("v2_create_score_failed", trace_id=trace_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"创建 Score 失败: {str(e)}")


# ─── 查询端点 ──────────────────────────────────────

@router.get(
    "/traces",
    summary="查询 Trace 列表",
    description="分页查询 Trace 列表，支持按 Agent ID、状态、时间范围过滤。",
    dependencies=[Depends(_verify_api_key)],
)
async def list_traces_v2(
    agent_id: Optional[str] = Query(None, description="按 Agent ID 过滤"),
    status: Optional[str] = Query(None, description="按状态过滤（ok/error）"),
    source: Optional[str] = Query(None, description="按来源过滤（api/sdk/otel/eval）"),
    limit: int = Query(20, ge=1, le=100, description="每页条数"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """查询 Trace 列表。"""
    from app.core.database import prisma

    try:
        where: Dict[str, Any] = {}
        if agent_id:
            where["agentId"] = agent_id
        if status:
            where["status"] = status
        if source:
            where["source"] = source

        traces = await prisma.trace.find_many(
            where=where,
            order={"createdAt": "desc"},
            take=limit,
            skip=offset,
            include={"scores": True},
        )

        total = await prisma.trace.count(where=where)

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "data": [
                {
                    "id": t.id,
                    "name": t.name,
                    "source": t.source,
                    "status": t.status,
                    "agent_id": t.agentId,
                    "input": t.input[:200] if t.input else None,
                    "output": t.output[:200] if t.output else None,
                    "latency_ms": t.totalLatencyMs,
                    "total_tokens": t.totalTokens,
                    "score_count": len(t.scores) if t.scores else 0,
                    "created_at": t.createdAt.isoformat() if t.createdAt else None,
                }
                for t in traces
            ],
        }

    except Exception as e:
        logger.error("v2_list_traces_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get(
    "/traces/{trace_id}",
    summary="获取 Trace 详情",
    description="获取一条 Trace 的完整详情，包括所有 Span 和 Score。",
    dependencies=[Depends(_verify_api_key)],
)
async def get_trace_v2(trace_id: str):
    """获取 Trace 详情（含 Spans + Scores）。"""
    from app.core.database import prisma

    try:
        trace = await prisma.trace.find_unique(
            where={"id": trace_id},
            include={
                "spans": {"order_by": {"startTime": "asc"}},
                "scores": True,
            },
        )

        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        return {
            "id": trace.id,
            "name": trace.name,
            "source": trace.source,
            "status": trace.status,
            "agent_id": trace.agentId,
            "session_id": trace.sessionId,
            "user_id": trace.userId,
            "input": trace.input,
            "output": trace.output,
            "metadata": trace.metadata,
            "tags": trace.tags,
            "latency_ms": trace.totalLatencyMs,
            "total_tokens": trace.totalTokens,
            "prompt_tokens": trace.promptTokens,
            "completion_tokens": trace.completionTokens,
            "total_cost": trace.totalCost,
            "llm_call_count": trace.llmCallCount,
            "tool_call_count": trace.toolCallCount,
            "created_at": trace.createdAt.isoformat() if trace.createdAt else None,
            "start_time": trace.startTime.isoformat() if trace.startTime else None,
            "end_time": trace.endTime.isoformat() if trace.endTime else None,
            "spans": [
                {
                    "id": s.id,
                    "name": s.name,
                    "kind": s.kind,
                    "status": s.status,
                    "parent_span_id": s.parentSpanId,
                    "input": s.input,
                    "output": s.output,
                    "latency_ms": s.latencyMs,
                    "llm_model": s.llmModel,
                    "llm_prompt_tokens": s.llmPromptTokens,
                    "llm_completion_tokens": s.llmCompletionTokens,
                    "tool_name": s.toolName,
                    "start_time": s.startTime.isoformat() if s.startTime else None,
                }
                for s in (trace.spans or [])
            ],
            "scores": [
                {
                    "id": sc.id,
                    "name": sc.name,
                    "value": sc.value,
                    "string_value": sc.stringValue,
                    "comment": sc.comment,
                    "source": sc.source,
                    "created_at": sc.createdAt.isoformat() if sc.createdAt else None,
                }
                for sc in (trace.scores or [])
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("v2_get_trace_failed", trace_id=trace_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


# ─── Webhook 端点 ──────────────────────────────────

@router.post(
    "/webhook/{agent_id}",
    response_model=TraceResponse,
    summary="Webhook 数据接收",
    description="接收外部平台推送的任意 JSON 数据，通过 Agent 配置的映射规则转为 Trace。",
    dependencies=[Depends(_verify_api_key)],
)
async def webhook_receive(agent_id: str, data: CreateWebhookRequest):
    """接收外部系统推送的数据。

    将原始 JSON 数据存为 Trace，input 为完整的原始数据。
    后续可通过 Agent 配置的 webhook_mapping 提取结构化字段。
    """
    try:
        raw_json = json.dumps(data.data, ensure_ascii=False)

        # 尝试从常见字段提取 input/output
        raw = data.data
        input_text = (
            raw.get("input")
            or raw.get("query")
            or raw.get("question")
            or raw.get("message")
            or raw_json
        )
        output_text = (
            raw.get("output")
            or raw.get("answer")
            or raw.get("response")
            or raw.get("result")
        )

        trace_name = raw.get("name") or raw.get("event") or "webhook"

        trace_id = await create_trace(
            name=trace_name,
            source="webhook",
            agent_id=agent_id,
            input_text=_to_str(input_text),
            output_text=_to_str(output_text),
            metadata={"webhook_raw": data.data},
            tags=[f"agent:{agent_id}", "source:webhook"],
        )

        if output_text:
            await end_trace(trace_id=trace_id, output_text=_to_str(output_text))

        await publish_trace_event(trace_id, agent_id)

        return TraceResponse(id=trace_id)

    except Exception as e:
        logger.error("v2_webhook_failed", agent_id=agent_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Webhook 处理失败: {str(e)}")
