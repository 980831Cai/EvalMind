"""OTLP HTTP Receiver - 接收 OpenTelemetry Trace 数据

支持 OTLP/HTTP JSON 格式的 POST /v1/traces 端点。
用户 Agent 通过 OpenTelemetry SDK 自动上报调用链数据到此端点。

GenAI Semantic Conventions 属性映射:
  - gen_ai.request.model → llm_model
  - gen_ai.usage.prompt_tokens → llm_prompt_tokens
  - gen_ai.usage.completion_tokens → llm_completion_tokens
  - gen_ai.request.temperature → llm_temperature
  - gen_ai.response.finish_reason → llm_finish_reason
"""
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from app.core.database import prisma
from app.core.logging import get_logger
from app.services.trace_service import create_trace, end_trace, create_span
from app.services.online_eval_worker import publish_trace_event

logger = get_logger("otlp_receiver")

router = APIRouter(tags=["OTLP Receiver"])


# ============================================================
# OTLP JSON Schema (simplified for GenAI use cases)
# ============================================================

class OtlpKeyValue(BaseModel):
    key: str
    value: Dict[str, Any] = {}


class OtlpEvent(BaseModel):
    timeUnixNano: Optional[str] = None
    name: Optional[str] = None
    attributes: Optional[List[OtlpKeyValue]] = None


class OtlpSpan(BaseModel):
    traceId: str = ""
    spanId: str = ""
    parentSpanId: Optional[str] = None
    name: str = ""
    kind: Optional[int] = 0  # OTLP SpanKind: 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT
    startTimeUnixNano: Optional[str] = None
    endTimeUnixNano: Optional[str] = None
    attributes: Optional[List[OtlpKeyValue]] = None
    events: Optional[List[OtlpEvent]] = None
    status: Optional[Dict[str, Any]] = None


class OtlpScopeSpans(BaseModel):
    scope: Optional[Dict[str, Any]] = None
    spans: List[OtlpSpan] = []


class OtlpResourceSpans(BaseModel):
    resource: Optional[Dict[str, Any]] = None
    scopeSpans: List[OtlpScopeSpans] = []


class OtlpTraceRequest(BaseModel):
    resourceSpans: List[OtlpResourceSpans] = []


# ============================================================
# Helper functions
# ============================================================

def _attrs_to_dict(attrs: Optional[List[OtlpKeyValue]]) -> Dict[str, Any]:
    """将 OTLP attributes 列表转为 dict"""
    if not attrs:
        return {}
    result = {}
    for attr in attrs:
        val = attr.value
        if "stringValue" in val:
            result[attr.key] = val["stringValue"]
        elif "intValue" in val:
            result[attr.key] = int(val["intValue"])
        elif "doubleValue" in val:
            result[attr.key] = float(val["doubleValue"])
        elif "boolValue" in val:
            result[attr.key] = bool(val["boolValue"])
        elif "arrayValue" in val:
            result[attr.key] = val["arrayValue"]
        else:
            result[attr.key] = str(val)
    return result


def _nano_to_datetime(nano_str: Optional[str]) -> Optional[datetime]:
    """纳秒时间戳转 datetime"""
    if not nano_str:
        return None
    try:
        ts_ns = int(nano_str)
        ts_s = ts_ns / 1_000_000_000
        return datetime.fromtimestamp(ts_s, tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None


def _nano_to_ms(start_nano: Optional[str], end_nano: Optional[str]) -> Optional[int]:
    """计算两个纳秒时间戳之间的毫秒差"""
    if not start_nano or not end_nano:
        return None
    try:
        return int((int(end_nano) - int(start_nano)) / 1_000_000)
    except (ValueError, TypeError):
        return None


def _detect_span_kind(attrs: Dict[str, Any], span_name: str) -> str:
    """根据 GenAI Semantic Conventions 检测 span 类型"""
    # 检查 opentelemetry-instrumentation-openai 等库的属性
    if attrs.get("gen_ai.request.model") or attrs.get("llm.request.model"):
        return "llm"
    if attrs.get("gen_ai.system") or "llm" in span_name.lower():
        return "llm"

    # Tool detection
    if "tool" in span_name.lower() or attrs.get("tool.name"):
        return "tool"

    # Retrieval detection
    if "retriev" in span_name.lower() or "search" in span_name.lower() or attrs.get("db.system"):
        return "retrieval"

    # Agent/Chain detection
    if "agent" in span_name.lower():
        return "agent"
    if "chain" in span_name.lower() or "workflow" in span_name.lower():
        return "chain"

    return "other"


def _detect_framework(resource_attrs: Dict[str, Any], scope_name: str, span_attrs: Dict[str, Any]) -> str:
    """检测 Agent 框架类型

    支持的框架:
    - LangGraph: scope 名含 "langgraph"
    - OpenAI Agents SDK: scope 名含 "openai.agents" 或属性含 openai_agents
    - Pydantic AI: scope 名含 "pydantic_ai" 或 "pydantic-ai"
    - CrewAI: scope 名含 "crewai"
    - LangChain: scope 名含 "langchain"
    - AutoGen: scope 名含 "autogen"
    - 自有 SDK: resource 中含 agent_eval_sdk 标记
    """
    scope_lower = (scope_name or "").lower()
    service_name = str(resource_attrs.get("service.name", "")).lower()
    sdk_name = str(resource_attrs.get("telemetry.sdk.name", "")).lower()

    if "langgraph" in scope_lower or "langgraph" in service_name:
        return "langgraph"
    if "openai.agents" in scope_lower or "openai-agents" in service_name:
        return "openai-agents"
    if "pydantic_ai" in scope_lower or "pydantic-ai" in scope_lower:
        return "pydantic-ai"
    if "crewai" in scope_lower or "crewai" in service_name:
        return "crewai"
    if "langchain" in scope_lower or "langchain" in service_name:
        return "langchain"
    if "autogen" in scope_lower:
        return "autogen"
    if "agent-eval-sdk" in sdk_name or resource_attrs.get("agent_eval_sdk"):
        return "agent-eval-sdk"
    return "generic"


def _extract_framework_metadata(framework: str, attrs: Dict[str, Any], span_name: str) -> Dict[str, Any]:
    """根据框架类型提取额外的元数据"""
    meta: Dict[str, Any] = {"framework": framework}

    if framework == "langgraph":
        meta["graph_name"] = attrs.get("langgraph.graph.name", span_name)
        meta["node_name"] = attrs.get("langgraph.node.name")
        meta["step_index"] = attrs.get("langgraph.step")
        meta["thread_id"] = attrs.get("langgraph.thread.id")

    elif framework == "openai-agents":
        meta["agent_name"] = attrs.get("openai.agents.agent_name", span_name)
        meta["tool_type"] = attrs.get("openai.agents.tool_type")
        meta["handoff_target"] = attrs.get("openai.agents.handoff_target")

    elif framework == "pydantic-ai":
        meta["agent_name"] = attrs.get("pydantic_ai.agent.name", span_name)
        meta["model_name"] = attrs.get("pydantic_ai.model.name")

    elif framework == "crewai":
        meta["crew_name"] = attrs.get("crewai.crew.name")
        meta["task_name"] = attrs.get("crewai.task.name")
        meta["agent_role"] = attrs.get("crewai.agent.role")

    elif framework == "langchain":
        meta["chain_type"] = attrs.get("langchain.chain.type")
        meta["run_type"] = attrs.get("langchain.run.type")

    # 清理 None 值
    return {k: v for k, v in meta.items() if v is not None}


# ============================================================
# OTLP HTTP Endpoint
# ============================================================

@router.post("/v1/traces")
async def receive_otlp_traces(request: Request):
    """
    OTLP/HTTP JSON Trace Receiver.
    
    接收 OpenTelemetry SDK 上报的 Trace 数据，解析 GenAI Semantic Conventions，
    将数据存入本地 traces/spans 表。
    
    用户只需配置 OTEL_EXPORTER_OTLP_ENDPOINT 指向本平台即可自动上报。
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    try:
        otlp_data = OtlpTraceRequest(**body)
    except Exception as e:
        logger.warning("otlp_parse_failed", error=str(e))
        raise HTTPException(status_code=400, detail=f"Invalid OTLP format: {e}")

    created_traces = 0
    created_spans = 0

    for resource_spans in otlp_data.resourceSpans:
        # 提取 resource attributes（如 service.name）
        resource_attrs = {}
        if resource_spans.resource and resource_spans.resource.get("attributes"):
            raw_attrs = resource_spans.resource["attributes"]
            if isinstance(raw_attrs, list):
                resource_attrs = _attrs_to_dict([OtlpKeyValue(**a) for a in raw_attrs])
            elif isinstance(raw_attrs, dict):
                resource_attrs = raw_attrs

        service_name = resource_attrs.get("service.name", "unknown")

        # 从 resource 中提取 agent_id (自定义属性)
        agent_id = resource_attrs.get("agent.id") or resource_attrs.get("agent_id")

        for scope_spans in resource_spans.scopeSpans:
            if not scope_spans.spans:
                continue

            # 检测框架
            scope_name = ""
            if scope_spans.scope:
                scope_name = scope_spans.scope.get("name", "")

            framework = _detect_framework(resource_attrs, scope_name, {})

            # 按 traceId 分组 spans
            trace_groups: Dict[str, List[OtlpSpan]] = {}
            for span in scope_spans.spans:
                tid = span.traceId
                if tid:
                    trace_groups.setdefault(tid, []).append(span)

            for otlp_trace_id, spans in trace_groups.items():
                try:
                    await _process_trace_group(
                        otlp_trace_id=otlp_trace_id,
                        spans=spans,
                        agent_id=agent_id,
                        service_name=service_name,
                        resource_attrs=resource_attrs,
                        framework=framework,
                    )
                    created_traces += 1
                    created_spans += len(spans)
                    # 发布在线评估事件
                    await publish_trace_event(otlp_trace_id, agent_id)
                except Exception as e:
                    logger.error("otlp_trace_process_failed",
                                 trace_id=otlp_trace_id, error=str(e))

    return {
        "status": "ok",
        "created_traces": created_traces,
        "created_spans": created_spans,
    }


async def _process_trace_group(
    otlp_trace_id: str,
    spans: List[OtlpSpan],
    agent_id: Optional[str],
    service_name: str,
    resource_attrs: Dict[str, Any],
    framework: str = "generic",
):
    """处理一组属于同一 trace 的 spans"""

    # 找到 root span (没有 parentSpanId 的)
    root_spans = [s for s in spans if not s.parentSpanId]
    root = root_spans[0] if root_spans else spans[0]

    root_attrs = _attrs_to_dict(root.attributes)

    # 计算整体时间
    all_starts = [int(s.startTimeUnixNano) for s in spans if s.startTimeUnixNano]
    all_ends = [int(s.endTimeUnixNano) for s in spans if s.endTimeUnixNano]
    earliest_start = min(all_starts) if all_starts else None
    latest_end = max(all_ends) if all_ends else None
    total_latency_ms = int((latest_end - earliest_start) / 1_000_000) if earliest_start and latest_end else None

    # 统计 LLM 和 Tool 调用次数
    total_tokens = 0
    prompt_tokens_sum = 0
    completion_tokens_sum = 0
    llm_count = 0
    tool_count = 0

    for s in spans:
        s_attrs = _attrs_to_dict(s.attributes)
        kind = _detect_span_kind(s_attrs, s.name)
        if kind == "llm":
            llm_count += 1
            pt = _get_int_attr(s_attrs, "gen_ai.usage.prompt_tokens", "llm.usage.prompt_tokens")
            ct = _get_int_attr(s_attrs, "gen_ai.usage.completion_tokens", "llm.usage.completion_tokens")
            prompt_tokens_sum += pt
            completion_tokens_sum += ct
            total_tokens += pt + ct
        elif kind == "tool":
            tool_count += 1

    # 验证 agent_id 是否存在于数据库
    valid_agent_id = None
    if agent_id:
        agent = await prisma.agent.find_unique(where={"id": agent_id})
        if agent:
            valid_agent_id = agent_id

    # 创建 Trace
    trace_metadata = {
        "otlp_trace_id": otlp_trace_id,
        "service_name": service_name,
        "framework": framework,
        "resource_attrs": resource_attrs,
    }
    # 从 root span 提取框架特有元数据
    if framework != "generic":
        framework_meta = _extract_framework_metadata(framework, root_attrs, root.name)
        trace_metadata.update(framework_meta)

    trace_id = await create_trace(
        name=root.name or service_name,
        source="otel",
        agent_id=valid_agent_id,
        input_text=root_attrs.get("input") or root_attrs.get("gen_ai.prompt") or None,
        output_text=root_attrs.get("output") or root_attrs.get("gen_ai.completion") or None,
        metadata=trace_metadata,
        tags=["otel", service_name] + ([framework] if framework != "generic" else []),
        start_time=_nano_to_datetime(str(earliest_start)) if earliest_start else None,
    )

    await end_trace(
        trace_id=trace_id,
        total_latency_ms=total_latency_ms,
        total_tokens=total_tokens,
        prompt_tokens=prompt_tokens_sum,
        completion_tokens=completion_tokens_sum,
        llm_call_count=llm_count,
        tool_call_count=tool_count,
        end_time=_nano_to_datetime(str(latest_end)) if latest_end else None,
    )

    # 建立 spanId -> our_span_id 映射
    span_id_map: Dict[str, str] = {}

    # 先按层级排序（root 先）
    sorted_spans = sorted(spans, key=lambda s: (1 if s.parentSpanId else 0, s.startTimeUnixNano or "0"))

    for s in sorted_spans:
        s_attrs = _attrs_to_dict(s.attributes)
        kind = _detect_span_kind(s_attrs, s.name)
        latency = _nano_to_ms(s.startTimeUnixNano, s.endTimeUnixNano)

        # 解析 parent_span_id
        parent_id = span_id_map.get(s.parentSpanId) if s.parentSpanId else None

        # 解析 status
        status = "ok"
        status_message = None
        if s.status:
            code = s.status.get("code", 0)
            if code == 2:  # STATUS_CODE_ERROR
                status = "error"
            status_message = s.status.get("message")

        # 解析 events
        events_data = None
        if s.events:
            events_data = []
            for ev in s.events:
                ev_attrs = _attrs_to_dict(ev.attributes) if ev.attributes else {}
                events_data.append({
                    "name": ev.name,
                    "timestamp": ev.timeUnixNano,
                    "attributes": ev_attrs,
                })

        # 构建 span 参数
        span_kwargs: Dict[str, Any] = {
            "trace_id": trace_id,
            "name": s.name,
            "kind": kind,
            "parent_span_id": parent_id,
            "status": status,
            "status_message": status_message,
            "start_time": _nano_to_datetime(s.startTimeUnixNano),
            "end_time": _nano_to_datetime(s.endTimeUnixNano),
            "latency_ms": latency,
            "input_text": s_attrs.get("input") or s_attrs.get("gen_ai.prompt"),
            "output_text": s_attrs.get("output") or s_attrs.get("gen_ai.completion"),
            "attributes": s_attrs if s_attrs else None,
            "events": events_data,
        }

        # LLM 属性
        if kind == "llm":
            span_kwargs.update({
                "llm_model": s_attrs.get("gen_ai.request.model") or s_attrs.get("llm.request.model"),
                "llm_prompt": s_attrs.get("gen_ai.prompt") or s_attrs.get("llm.prompts"),
                "llm_completion": s_attrs.get("gen_ai.completion") or s_attrs.get("llm.completions"),
                "llm_prompt_tokens": _get_int_attr(s_attrs, "gen_ai.usage.prompt_tokens", "llm.usage.prompt_tokens"),
                "llm_completion_tokens": _get_int_attr(s_attrs, "gen_ai.usage.completion_tokens", "llm.usage.completion_tokens"),
                "llm_total_tokens": _get_int_attr(s_attrs, "gen_ai.usage.total_tokens", "llm.usage.total_tokens"),
                "llm_temperature": _get_float_attr(s_attrs, "gen_ai.request.temperature", "llm.request.temperature"),
                "llm_finish_reason": s_attrs.get("gen_ai.response.finish_reason"),
            })
            # 计算 total_tokens if not set
            if not span_kwargs["llm_total_tokens"]:
                pt = span_kwargs.get("llm_prompt_tokens") or 0
                ct = span_kwargs.get("llm_completion_tokens") or 0
                if pt + ct > 0:
                    span_kwargs["llm_total_tokens"] = pt + ct

        # Tool 属性
        elif kind == "tool":
            span_kwargs.update({
                "tool_name": s_attrs.get("tool.name") or s.name,
                "tool_input": s_attrs.get("tool.input") or s_attrs.get("input"),
                "tool_output": s_attrs.get("tool.output") or s_attrs.get("output"),
                "tool_status": "success" if status == "ok" else "error",
            })

        # Retrieval 属性
        elif kind == "retrieval":
            span_kwargs.update({
                "retrieval_query": s_attrs.get("retrieval.query") or s_attrs.get("db.statement"),
                "retrieval_doc_count": _get_int_attr(s_attrs, "retrieval.documents.count"),
            })

        # 移除 None 值参数
        span_kwargs = {k: v for k, v in span_kwargs.items() if v is not None}

        our_span_id = await create_span(**span_kwargs)
        span_id_map[s.spanId] = our_span_id


def _get_int_attr(attrs: Dict, *keys) -> int:
    """从属性字典中获取 int 值"""
    for key in keys:
        val = attrs.get(key)
        if val is not None:
            try:
                return int(val)
            except (ValueError, TypeError):
                pass
    return 0


def _get_float_attr(attrs: Dict, *keys) -> Optional[float]:
    """从属性字典中获取 float 值"""
    for key in keys:
        val = attrs.get(key)
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass
    return None
