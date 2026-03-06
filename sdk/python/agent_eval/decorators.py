"""装饰器 - @observe() 零侵入接入"""
import functools
import inspect
import json
from typing import Any, Callable, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from agent_eval.client import AgentEval


def observe(
    client: Optional["AgentEval"] = None,
    name: Optional[str] = None,
    kind: str = "chain",
) -> Callable:
    """
    @ae.observe() 装饰器，自动记录函数的 input/output/latency/error。

    用法:
        @ae.observe()
        def handle_query(query: str) -> str:
            return my_agent.run(query)

        @ae.observe(name="custom-name", kind="llm")
        async def generate(prompt: str) -> str:
            return await llm.generate(prompt)
    """
    def decorator(func: Callable) -> Callable:
        trace_name = name or func.__name__

        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                ae = client or _get_default_client()
                if ae is None:
                    return await func(*args, **kwargs)

                with ae.trace(name=trace_name) as trace:
                    # 序列化 input
                    input_str = _serialize_args(args, kwargs)
                    trace.set_input(input_str)

                    try:
                        result = await func(*args, **kwargs)
                        trace.set_output(_serialize_output(result))
                        return result
                    except Exception as e:
                        trace.set_status("error")
                        raise

            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                ae = client or _get_default_client()
                if ae is None:
                    return func(*args, **kwargs)

                with ae.trace(name=trace_name) as trace:
                    input_str = _serialize_args(args, kwargs)
                    trace.set_input(input_str)

                    try:
                        result = func(*args, **kwargs)
                        trace.set_output(_serialize_output(result))
                        return result
                    except Exception as e:
                        trace.set_status("error")
                        raise

            return sync_wrapper

    return decorator


# 全局默认 client（可选）
_default_client: Optional["AgentEval"] = None


def set_default_client(client: "AgentEval") -> None:
    global _default_client
    _default_client = client


def _get_default_client() -> Optional["AgentEval"]:
    return _default_client


def _serialize_args(args: tuple, kwargs: dict) -> str:
    """将函数参数序列化为字符串"""
    try:
        parts = []
        for a in args:
            parts.append(repr(a) if not isinstance(a, str) else a)
        for k, v in kwargs.items():
            parts.append(f"{k}={repr(v)}")
        return ", ".join(parts) if parts else "(no args)"
    except Exception:
        return "(serialization error)"


def _serialize_output(result: Any) -> str:
    """将函数返回值序列化为字符串"""
    try:
        if isinstance(result, str):
            return result
        if isinstance(result, (dict, list)):
            return json.dumps(result, ensure_ascii=False, default=str)[:5000]
        return repr(result)[:5000]
    except Exception:
        return "(serialization error)"
