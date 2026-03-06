"""AgentEval 主类 - SDK 入口"""
from typing import Any, Dict, List, Optional

from agent_eval.transport import BatchTransport
from agent_eval.trace import TraceContext
from agent_eval.decorators import observe as _observe, set_default_client


class AgentEval:
    """
    Agent Eval SDK 客户端。

    用法:
        ae = AgentEval(
            base_url="http://localhost:8000",
            api_key="your-ingest-api-key",
            agent_id="your-agent-id",
        )

        # 方式1: 装饰器
        @ae.observe()
        def handle_query(query: str) -> str:
            return my_agent.run(query)

        # 方式2: Context Manager
        with ae.trace(name="chat") as trace:
            trace.set_input(query)
            result = my_agent.run(query)
            trace.set_output(result)
            trace.score(name="quality", value=0.9)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: str = "",
        agent_id: Optional[str] = None,
        flush_interval: float = 5.0,
        max_batch_size: int = 100,
        set_as_default: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.agent_id = agent_id

        self._transport = BatchTransport(
            base_url=self.base_url,
            api_key=self.api_key,
            flush_interval=flush_interval,
            max_batch_size=max_batch_size,
        )

        if set_as_default:
            set_default_client(self)

    def trace(
        self,
        name: str = "default",
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> TraceContext:
        """创建 Trace 上下文"""
        return TraceContext(
            client=self,
            name=name,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata,
            tags=tags,
        )

    def observe(
        self,
        name: Optional[str] = None,
        kind: str = "chain",
    ):
        """@ae.observe() 装饰器"""
        return _observe(client=self, name=name, kind=kind)

    def score(
        self,
        trace_id: str,
        name: str,
        value: Optional[float] = None,
        string_value: Optional[str] = None,
        comment: Optional[str] = None,
        span_id: Optional[str] = None,
    ) -> None:
        """直接上报一个 Score（不在 Trace 上下文中时使用）"""
        score_data: Dict[str, Any] = {
            "trace_id": trace_id,
            "name": name,
            "source": "sdk",
        }
        if value is not None:
            score_data["value"] = value
        if string_value is not None:
            score_data["string_value"] = string_value
        if comment is not None:
            score_data["comment"] = comment
        if span_id is not None:
            score_data["span_id"] = span_id
        self._transport.send_score(score_data)

    def flush(self) -> None:
        """手动 flush 所有缓冲事件"""
        self._transport._flush()

    def shutdown(self) -> None:
        """关闭 SDK"""
        self._transport.shutdown()
