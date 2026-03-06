"""Agent 框架集成模块

提供各主流 Agent 框架的自动集成适配器。
"""
from agent_eval.integrations.langgraph import LangGraphCallback
from agent_eval.integrations.crewai import CrewAICallback

__all__ = ["LangGraphCallback", "CrewAICallback"]
