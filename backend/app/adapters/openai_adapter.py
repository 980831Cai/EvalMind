"""OpenAI-compatible protocol adapter

Config example:
{
    "base_url": "https://api.openai.com/v1",
    "api_key": "sk-xxx",
    "model": "gpt-4",
    "system_prompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "timeout": 120
}
"""
import time
import httpx
from typing import Dict, Any
from app.adapters.base import BaseAdapter, AgentResponse, TrajectoryStep
from app.core.logging import get_logger
from app.core.http_client import get_http_client

logger = get_logger("openai_adapter")


class OpenAIAdapter(BaseAdapter):
    """OpenAI-compatible protocol adapter (supports any OpenAI Chat API compatible service)"""

    def validate_config(self) -> bool:
        return bool(self.config.get("base_url") and self.config.get("api_key"))

    async def invoke(self, message: str, conversation_id: str = "", model_override: str = "") -> AgentResponse:
        base_url = self.config["base_url"].rstrip("/")
        api_key = self.config["api_key"]
        model = model_override or self.config.get("model", "gpt-4")
        system_prompt = self.config.get("system_prompt", "")
        temperature = self.config.get("temperature", 0.7)
        timeout = self.config.get("timeout", 120)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False
        }

        start = time.time()
        try:
            client = get_http_client()
            resp = await client.post(f"{base_url}/chat/completions", json=body, headers=headers, timeout=timeout)
            resp.raise_for_status()
            latency_ms = int((time.time() - start) * 1000)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = data.get("usage", {})

            # Extract tool calls (if any)
            tool_calls_raw = data.get("choices", [{}])[0].get("message", {}).get("tool_calls", [])
            tool_calls = []
            trajectory_steps: list[TrajectoryStep] = []
            step_idx = 0

            for tc in tool_calls_raw:
                tc_name = tc.get("function", {}).get("name", "")
                tc_args = tc.get("function", {}).get("arguments", "")
                tool_calls.append({"name": tc_name, "arguments": tc_args})
                trajectory_steps.append(TrajectoryStep(
                    step_index=step_idx, step_type="tool_call",
                    content=f"Tool call: {tc_name}",
                    tool_name=tc_name, tool_args=tc_args,
                    timestamp_ms=0,
                ))
                step_idx += 1

            if content:
                trajectory_steps.append(TrajectoryStep(
                    step_index=step_idx, step_type="text_output",
                    content=content, timestamp_ms=latency_ms,
                ))

            return AgentResponse(
                content=content,
                latency_ms=latency_ms,
                token_usage={
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
                tool_calls=tool_calls,
                trajectory_steps=trajectory_steps,
                raw_response=data
            )
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            logger.error("openai_adapter_invoke_failed", error=str(e), model=model)
            return AgentResponse(error=str(e), latency_ms=latency_ms)
