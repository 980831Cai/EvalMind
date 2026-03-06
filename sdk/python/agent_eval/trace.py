"""Trace/Span 上下文管理"""
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from agent_eval.client import AgentEval


class SpanContext:
    """Span 上下文管理器"""

    def __init__(
        self,
        trace: "TraceContext",
        name: str,
        kind: str = "other",
        parent_span_id: Optional[str] = None,
    ):
        self._trace = trace
        self.span_id = str(uuid.uuid4())
        self.name = name
        self.kind = kind
        self.parent_span_id = parent_span_id
        self._start_time = time.time()
        self._start_dt = datetime.now(timezone.utc)
        self._input: Optional[str] = None
        self._output: Optional[str] = None
        self._status = "ok"
        self._status_message: Optional[str] = None
        self._attributes: Dict[str, Any] = {}
        self._events: List[Dict[str, Any]] = []
        # LLM
        self._model: Optional[str] = None
        self._prompt_tokens: Optional[int] = None
        self._completion_tokens: Optional[int] = None
        self._temperature: Optional[float] = None
        self._cost: Optional[float] = None
        # Tool
        self._tool_name: Optional[str] = None
        self._tool_input: Optional[str] = None
        self._tool_output: Optional[str] = None
        self._tool_status: Optional[str] = None

    def set_input(self, value: Any) -> "SpanContext":
        self._input = str(value) if value is not None else None
        return self

    def set_output(self, value: Any) -> "SpanContext":
        self._output = str(value) if value is not None else None
        return self

    def set_model(self, model: str) -> "SpanContext":
        self._model = model
        return self

    def set_token_usage(self, prompt: int = 0, completion: int = 0) -> "SpanContext":
        self._prompt_tokens = prompt
        self._completion_tokens = completion
        return self

    def set_temperature(self, temp: float) -> "SpanContext":
        self._temperature = temp
        return self

    def set_cost(self, cost: float) -> "SpanContext":
        self._cost = cost
        return self

    def set_tool(self, name: str, input_data: Any = None, output_data: Any = None, status: str = "success") -> "SpanContext":
        self._tool_name = name
        self._tool_input = str(input_data) if input_data is not None else None
        self._tool_output = str(output_data) if output_data is not None else None
        self._tool_status = status
        return self

    def set_status(self, status: str, message: Optional[str] = None) -> "SpanContext":
        self._status = status
        self._status_message = message
        return self

    def set_attribute(self, key: str, value: Any) -> "SpanContext":
        self._attributes[key] = value
        return self

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None) -> "SpanContext":
        self._events.append({
            "name": name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "attributes": attributes or {},
        })
        return self

    def __enter__(self) -> "SpanContext":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type:
            self._status = "error"
            self._status_message = str(exc_val)
        self._trace._add_span(self._to_dict())

    def _to_dict(self) -> Dict[str, Any]:
        end_time = time.time()
        latency_ms = int((end_time - self._start_time) * 1000)
        data: Dict[str, Any] = {
            "span_id": self.span_id,
            "trace_id": self._trace.trace_id,
            "name": self.name,
            "kind": self.kind,
            "status": self._status,
            "start_time": self._start_dt.isoformat(),
            "end_time": datetime.now(timezone.utc).isoformat(),
            "latency_ms": latency_ms,
        }
        if self.parent_span_id:
            data["parent_span_id"] = self.parent_span_id
        if self._input is not None:
            data["input"] = self._input
        if self._output is not None:
            data["output"] = self._output
        if self._status_message:
            data["status_message"] = self._status_message
        if self._attributes:
            data["attributes"] = self._attributes
        if self._events:
            data["events"] = self._events
        # LLM
        if self._model:
            data["llm_model"] = self._model
        if self._prompt_tokens is not None:
            data["llm_prompt_tokens"] = self._prompt_tokens
        if self._completion_tokens is not None:
            data["llm_completion_tokens"] = self._completion_tokens
        if self._temperature is not None:
            data["llm_temperature"] = self._temperature
        if self._cost is not None:
            data["llm_cost"] = self._cost
        # Tool
        if self._tool_name:
            data["tool_name"] = self._tool_name
        if self._tool_input is not None:
            data["tool_input"] = self._tool_input
        if self._tool_output is not None:
            data["tool_output"] = self._tool_output
        if self._tool_status:
            data["tool_status"] = self._tool_status
        return data


class TraceContext:
    """Trace 上下文管理器"""

    def __init__(
        self,
        client: "AgentEval",
        name: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ):
        self._client = client
        self.trace_id = str(uuid.uuid4())
        self.name = name
        self._session_id = session_id
        self._user_id = user_id
        self._metadata = metadata or {}
        self._tags = tags or []
        self._start_time = time.time()
        self._start_dt = datetime.now(timezone.utc)
        self._input: Optional[str] = None
        self._output: Optional[str] = None
        self._status = "ok"
        self._spans: List[Dict[str, Any]] = []
        self._scores: List[Dict[str, Any]] = []

    def set_input(self, value: Any) -> "TraceContext":
        self._input = str(value) if value is not None else None
        return self

    def set_output(self, value: Any) -> "TraceContext":
        self._output = str(value) if value is not None else None
        return self

    def set_status(self, status: str) -> "TraceContext":
        self._status = status
        return self

    def set_metadata(self, key: str, value: Any) -> "TraceContext":
        self._metadata[key] = value
        return self

    def add_tag(self, tag: str) -> "TraceContext":
        self._tags.append(tag)
        return self

    def span(
        self,
        name: str,
        kind: str = "other",
        parent_span_id: Optional[str] = None,
    ) -> SpanContext:
        """创建子 Span"""
        return SpanContext(
            trace=self,
            name=name,
            kind=kind,
            parent_span_id=parent_span_id,
        )

    def score(
        self,
        name: str,
        value: Optional[float] = None,
        string_value: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> "TraceContext":
        """上报 Score"""
        self._scores.append({
            "trace_id": self.trace_id,
            "name": name,
            "value": value,
            "string_value": string_value,
            "comment": comment,
            "source": "sdk",
        })
        return self

    def _add_span(self, span_data: Dict[str, Any]) -> None:
        self._spans.append(span_data)

    def __enter__(self) -> "TraceContext":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type:
            self._status = "error"
        self._flush()

    def end(self) -> None:
        """手动结束 Trace（不使用 context manager 时调用）"""
        self._flush()

    def _flush(self) -> None:
        """将 Trace + Spans + Scores 发送到平台"""
        try:
            end_time = time.time()
            latency_ms = int((end_time - self._start_time) * 1000)

            # 构建 Trace 事件
            trace_event = {
                "type": "trace",
                "trace_id": self.trace_id,
                "agent_id": self._client.agent_id,
                "name": self.name,
                "source": "sdk",
                "status": self._status,
                "start_time": self._start_dt.isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                "total_latency_ms": latency_ms,
                "session_id": self._session_id,
                "user_id": self._user_id,
                "metadata": self._metadata,
                "tags": self._tags,
            }
            if self._input is not None:
                trace_event["input"] = self._input
            if self._output is not None:
                trace_event["output"] = self._output

            # 聚合统计
            llm_count = sum(1 for s in self._spans if s.get("kind") == "llm")
            tool_count = sum(1 for s in self._spans if s.get("kind") == "tool")
            total_tokens = sum(
                (s.get("llm_prompt_tokens") or 0) + (s.get("llm_completion_tokens") or 0)
                for s in self._spans
            )
            trace_event["llm_call_count"] = llm_count
            trace_event["tool_call_count"] = tool_count
            trace_event["total_tokens"] = total_tokens

            # 发送 Trace
            self._client._transport.enqueue(trace_event)

            # 发送 Spans
            for span_data in self._spans:
                span_event = {"type": "span", **span_data}
                self._client._transport.enqueue(span_event)

            # 发送 Scores
            for score_data in self._scores:
                self._client._transport.send_score(score_data)

        except Exception:
            pass
