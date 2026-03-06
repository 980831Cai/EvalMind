"""Agent 适配器基类"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class TrajectoryStep:
    """Agent 执行轨迹的单个步骤"""
    step_index: int
    step_type: str  # "thinking" | "tool_call" | "tool_result" | "text_output"
    content: str = ""
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result: Optional[str] = None
    timestamp_ms: int = 0       # 相对于任务开始的毫秒数
    duration_ms: int = 0        # 该步骤耗时

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "step_index": self.step_index,
            "step_type": self.step_type,
            "content": self.content,
            "timestamp_ms": self.timestamp_ms,
            "duration_ms": self.duration_ms,
        }
        if self.tool_name:
            d["tool_name"] = self.tool_name
        if self.tool_args:
            d["tool_args"] = self.tool_args
        if self.tool_result is not None:
            d["tool_result"] = self.tool_result
        return d


@dataclass
class AgentResponse:
    """Agent 统一响应格式"""
    content: str = ""
    thinking: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    trajectory_steps: List[TrajectoryStep] = field(default_factory=list)
    token_usage: Dict[str, int] = field(default_factory=dict)
    latency_ms: int = 0
    raw_response: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    # 多轮对话支持
    turn_index: int = 0
    conversation_history: List[Dict[str, str]] = field(default_factory=list)


class BaseAdapter(ABC):
    """Agent 调用适配器基类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    async def invoke(self, message: str, conversation_id: str = "", model_override: str = "") -> AgentResponse:
        """调用 Agent 并返回统一格式的响应"""
        pass

    async def invoke_with_history(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        conversation_id: str = "",
        model_override: str = "",
    ) -> AgentResponse:
        """带对话历史的调用，支持多轮对话评估。

        默认实现将 history 拼接到消息中并调用 invoke()。
        子类可以重写此方法以使用原生会话管理（如 session API）。
        """
        if not history:
            return await self.invoke(message, conversation_id, model_override)

        # 将历史对话拼接到消息前面
        history_text = ""
        for turn in history:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role == "user":
                history_text += f"用户: {content}\n"
            else:
                history_text += f"助手: {content}\n"

        full_message = f"[对话历史]\n{history_text}\n[当前问题]\n{message}"
        return await self.invoke(full_message, conversation_id, model_override)

    @abstractmethod
    def validate_config(self) -> bool:
        """验证配置是否完整"""
        pass
