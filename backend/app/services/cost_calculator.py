"""成本计算服务 — 基于 token 用量和模型定价"""
from typing import Dict, Any, Optional

from app.core.logging import get_logger

logger = get_logger("cost_calculator")

# 每百万 token 的价格 (USD)
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # OpenAI
    "gpt-4o": {"input": 2.5, "output": 10.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "gpt-4-turbo": {"input": 10.0, "output": 30.0},
    "gpt-4": {"input": 30.0, "output": 60.0},
    "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
    # DeepSeek
    "deepseek-v3": {"input": 0.27, "output": 1.10},
    "deepseek-v3.1": {"input": 0.27, "output": 1.10},
    "deepseek-v3.2": {"input": 0.27, "output": 1.10},
    "deepseek-chat": {"input": 0.27, "output": 1.10},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
    # Anthropic
    "claude-4.5-sonnet": {"input": 3.0, "output": 15.0},
    "claude-4.6-sonnet": {"input": 3.0, "output": 15.0},
    "claude-4.6-opus": {"input": 15.0, "output": 75.0},
    "claude-3.5-sonnet": {"input": 3.0, "output": 15.0},
    "claude-3-opus": {"input": 15.0, "output": 75.0},
    # Tencent
    "hunyuan-2.0-thinking": {"input": 2.0, "output": 8.0},
    "hunyuan-2.0-instruct": {"input": 1.0, "output": 4.0},
    "hy-2.0-think": {"input": 2.0, "output": 8.0},
    "hy-2.0-instruct": {"input": 1.0, "output": 4.0},
    # GLM
    "glm-4.7": {"input": 1.0, "output": 4.0},
    # Kimi
    "kimi-k2.5": {"input": 1.0, "output": 4.0},
}

# 默认定价（未知模型）
DEFAULT_PRICING = {"input": 1.0, "output": 4.0}


def calculate_cost(token_usage: Dict, model_name: str) -> Dict[str, Any]:
    """根据 token 用量和模型定价计算费用 (USD)"""
    if not token_usage:
        return {"input_cost": 0, "output_cost": 0, "total_cost": 0, "model": model_name}

    pricing = _get_pricing(model_name)
    prompt_tokens = token_usage.get("prompt_tokens", token_usage.get("prompt", 0))
    completion_tokens = token_usage.get("completion_tokens", token_usage.get("completion", 0))

    input_cost = round(prompt_tokens * pricing["input"] / 1_000_000, 6)
    output_cost = round(completion_tokens * pricing["output"] / 1_000_000, 6)
    total_cost = round(input_cost + output_cost, 6)

    return {
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": total_cost,
        "model": model_name,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
    }


def calculate_eval_result_cost(
    agent_usage: Optional[Dict],
    agent_model: str,
    judge_model: str = "",
    judge_usage: Optional[Dict] = None,
) -> Dict[str, Any]:
    """计算单个评测结果的总成本：agent + judge"""
    agent_cost = calculate_cost(agent_usage or {}, agent_model)
    judge_cost = calculate_cost(judge_usage or {}, judge_model) if judge_model else {
        "input_cost": 0, "output_cost": 0, "total_cost": 0, "model": ""
    }

    return {
        "agent_cost": agent_cost,
        "judge_cost": judge_cost,
        "total_cost": round(agent_cost["total_cost"] + judge_cost["total_cost"], 6),
    }


def _get_pricing(model_name: str) -> Dict[str, float]:
    """获取模型定价，支持模糊匹配"""
    if not model_name:
        return DEFAULT_PRICING

    lower = model_name.strip().lower()

    # 精确匹配
    if lower in MODEL_PRICING:
        return MODEL_PRICING[lower]

    # 前缀匹配
    for key, pricing in MODEL_PRICING.items():
        if lower.startswith(key) or key.startswith(lower):
            return pricing

    # 品牌匹配
    if "gpt-4o" in lower:
        return MODEL_PRICING["gpt-4o"]
    if "gpt-4" in lower:
        return MODEL_PRICING["gpt-4"]
    if "deepseek" in lower:
        return MODEL_PRICING["deepseek-v3"]
    if "claude" in lower and "opus" in lower:
        return MODEL_PRICING.get("claude-4.6-opus", DEFAULT_PRICING)
    if "claude" in lower:
        return MODEL_PRICING.get("claude-4.5-sonnet", DEFAULT_PRICING)
    if "hunyuan" in lower:
        return MODEL_PRICING["hunyuan-2.0-instruct"]

    return DEFAULT_PRICING
