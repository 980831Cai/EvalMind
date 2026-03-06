"""LangGraph 集成适配器

LangGraph 原生支持 OTel 导出，用户只需设置环境变量即可自动接入。
此模块提供额外的 Callback 机制，用于在没有配置 OTel 的情况下通过 SDK 上报。

使用方式 1 (推荐 - OTel 原生):
    设置环境变量:
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:8000
    OTEL_RESOURCE_ATTRIBUTES=agent.id=your-agent-id

使用方式 2 (SDK Callback):
    from agent_eval import AgentEval
    from agent_eval.integrations.langgraph import LangGraphCallback

    ae = AgentEval(base_url="http://localhost:8000", agent_id="my-agent")
    callback = LangGraphCallback(ae)

    # 在 LangGraph 中使用
    app = graph.compile()
    result = app.invoke(input_data, config={"callbacks": [callback]})
"""
from typing import Any, Dict, Optional
from datetime import datetime, timezone


class LangGraphCallback:
    """LangGraph 回调适配器，将 LangGraph 事件转发到 Agent Eval 平台"""

    def __init__(self, client: Any):
        """
        Args:
            client: AgentEval 客户端实例
        """
        self._client = client
        self._trace = None
        self._span_stack: list = []

    def on_chain_start(self, serialized: Dict, inputs: Any, **kwargs: Any) -> None:
        """LangGraph chain/graph 开始"""
        name = serialized.get("name", "langgraph")
        run_id = kwargs.get("run_id", "")

        if not self._trace:
            self._trace = self._client.trace(name=f"langgraph:{name}")
            self._trace.__enter__()
            self._trace.set_input(inputs)
        else:
            span = self._trace.span(name=name)
            span.__enter__()
            span.set_metadata({"langgraph.node.name": name, "run_id": str(run_id)})
            self._span_stack.append(span)

    def on_chain_end(self, outputs: Any, **kwargs: Any) -> None:
        """LangGraph chain/graph 结束"""
        if self._span_stack:
            span = self._span_stack.pop()
            span.set_output(outputs)
            span.__exit__(None, None, None)
        elif self._trace:
            self._trace.set_output(outputs)
            self._trace.__exit__(None, None, None)
            self._trace = None

    def on_chain_error(self, error: BaseException, **kwargs: Any) -> None:
        """LangGraph chain/graph 出错"""
        if self._span_stack:
            span = self._span_stack.pop()
            span.__exit__(type(error), error, None)
        elif self._trace:
            self._trace.__exit__(type(error), error, None)
            self._trace = None

    def on_llm_start(self, serialized: Dict, prompts: Any, **kwargs: Any) -> None:
        """LLM 调用开始"""
        if not self._trace:
            return
        model = serialized.get("kwargs", {}).get("model_name", "unknown")
        span = self._trace.span(name=f"llm:{model}", kind="llm")
        span.__enter__()
        span.set_metadata({"gen_ai.request.model": model})
        self._span_stack.append(span)

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        """LLM 调用结束"""
        if self._span_stack:
            span = self._span_stack.pop()
            try:
                output_text = response.generations[0][0].text if response.generations else ""
                span.set_output(output_text)
                if hasattr(response, "llm_output") and response.llm_output:
                    usage = response.llm_output.get("token_usage", {})
                    span.set_token_usage(
                        prompt=usage.get("prompt_tokens", 0),
                        completion=usage.get("completion_tokens", 0),
                    )
            except (AttributeError, IndexError):
                pass
            span.__exit__(None, None, None)

    def on_tool_start(self, serialized: Dict, input_str: str, **kwargs: Any) -> None:
        """工具调用开始"""
        if not self._trace:
            return
        tool_name = serialized.get("name", "tool")
        span = self._trace.span(name=f"tool:{tool_name}", kind="tool")
        span.__enter__()
        span.set_metadata({"tool.name": tool_name, "tool.input": input_str})
        self._span_stack.append(span)

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """工具调用结束"""
        if self._span_stack:
            span = self._span_stack.pop()
            span.set_output(output)
            span.__exit__(None, None, None)

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        """工具调用出错"""
        if self._span_stack:
            span = self._span_stack.pop()
            span.__exit__(type(error), error, None)
