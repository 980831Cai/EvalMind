"""CrewAI 集成适配器

CrewAI 不原生支持 OTel，需要通过 SDK Callback 机制接入。

使用方式:
    from agent_eval import AgentEval
    from agent_eval.integrations.crewai import CrewAICallback

    ae = AgentEval(base_url="http://localhost:8000", agent_id="my-crew")
    callback = CrewAICallback(ae)

    # 在 CrewAI 中使用
    crew = Crew(
        agents=[...],
        tasks=[...],
        callbacks=[callback],
    )
    result = crew.kickoff()
"""
from typing import Any, Dict, Optional


class CrewAICallback:
    """CrewAI 回调适配器"""

    def __init__(self, client: Any):
        """
        Args:
            client: AgentEval 客户端实例
        """
        self._client = client
        self._trace = None
        self._current_spans: Dict[str, Any] = {}

    def on_crew_start(self, crew_name: str = "crew", **kwargs: Any) -> None:
        """Crew 开始执行"""
        self._trace = self._client.trace(name=f"crewai:{crew_name}")
        self._trace.__enter__()
        self._trace.set_metadata({
            "crewai.crew.name": crew_name,
            "framework": "crewai",
        })

    def on_crew_end(self, output: Any = None, **kwargs: Any) -> None:
        """Crew 执行结束"""
        if self._trace:
            if output:
                self._trace.set_output(output)
            self._trace.__exit__(None, None, None)
            self._trace = None
            self._current_spans.clear()

    def on_task_start(self, task_name: str = "task", agent_role: str = "", **kwargs: Any) -> None:
        """Task 开始执行"""
        if not self._trace:
            return
        span_key = f"task:{task_name}"
        span = self._trace.span(name=span_key, kind="agent")
        span.__enter__()
        span.set_metadata({
            "crewai.task.name": task_name,
            "crewai.agent.role": agent_role,
        })
        self._current_spans[span_key] = span

    def on_task_end(self, task_name: str = "task", output: Any = None, **kwargs: Any) -> None:
        """Task 执行结束"""
        span_key = f"task:{task_name}"
        span = self._current_spans.pop(span_key, None)
        if span:
            if output:
                span.set_output(output)
            span.__exit__(None, None, None)

    def on_tool_use(self, tool_name: str, tool_input: str = "", tool_output: str = "", **kwargs: Any) -> None:
        """工具使用事件"""
        if not self._trace:
            return
        span = self._trace.span(name=f"tool:{tool_name}", kind="tool")
        span.__enter__()
        span.set_metadata({"tool.name": tool_name, "tool.input": tool_input})
        span.set_output(tool_output)
        span.__exit__(None, None, None)

    def on_llm_call(
        self,
        model: str = "unknown",
        prompt: str = "",
        response: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        **kwargs: Any,
    ) -> None:
        """LLM 调用事件"""
        if not self._trace:
            return
        span = self._trace.span(name=f"llm:{model}", kind="llm")
        span.__enter__()
        span.set_model(model)
        span.set_output(response)
        span.set_token_usage(prompt=prompt_tokens, completion=completion_tokens)
        span.__exit__(None, None, None)
