"""适配器工厂"""
from typing import Dict, Any
from app.adapters.base import BaseAdapter
from app.adapters.http_adapter import HTTPAdapter
from app.adapters.openai_adapter import OpenAIAdapter
from app.adapters.knot_adapter import KnotAdapter


_ADAPTERS = {
    "http": HTTPAdapter,
    "openai": OpenAIAdapter,
    "knot": KnotAdapter,
}


def create_adapter(agent_type: str, config: Dict[str, Any]) -> BaseAdapter:
    """根据 agent_type 创建对应的适配器"""
    cls = _ADAPTERS.get(agent_type)
    if not cls:
        raise ValueError(f"不支持的 Agent 类型: {agent_type}，支持: {list(_ADAPTERS.keys())}")
    adapter = cls(config)
    if not adapter.validate_config():
        raise ValueError(f"Agent 配置不完整，请检查 {agent_type} 类型所需的字段")
    return adapter
