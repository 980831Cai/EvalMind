"""Knot AG-UI 协议适配器

配置示例:
{
    "agent_id": "88c709e8c75a44bca03ce1850230ec14",
    "api_token": "knot_xxx",
    "username": "demo-user",
    "personal_token": "xxx",
    "workspace_uuid": "xxx",
    "model": "deepseek-v3.1",
    "timeout": 300
}
"""
import time
import json
import httpx
from typing import Dict, Any
from app.adapters.base import BaseAdapter, AgentResponse, TrajectoryStep
from app.core.logging import get_logger

logger = get_logger("knot_adapter")


KNOT_API_BASE = "https://knot.woa.com/apigw/api/v1/agents/agui"

# Knot API 要求小写模型名，映射 UI 展示名 → API 名
KNOT_MODEL_MAP = {
    "deepseek-v3.1": "deepseek-v3.1",
    "deepseek-v3.2": "deepseek-v3.2",
    "claude-4.5-sonnet": "claude-4.5-sonnet",
    "claude-4.6-sonnet": "claude-4.6-sonnet",
    "kimi-k2.5": "kimi-k2.5",
    "glm-4.7": "glm-4.7",
    "hy-2.0-think": "hunyuan-2.0-thinking",
    "hy-2.0-instruct": "hunyuan-2.0-instruct",
    "hunyuan-2.0-thinking": "hunyuan-2.0-thinking",
    "hunyuan-2.0-instruct": "hunyuan-2.0-instruct",
}


def _normalize_knot_model(name: str) -> str:
    """将用户输入的模型名标准化为 Knot API 接受的格式"""
    lower = name.strip().lower()
    return KNOT_MODEL_MAP.get(lower, lower)


class KnotAdapter(BaseAdapter):
    """Knot AG-UI 协议适配器"""

    def validate_config(self) -> bool:
        cfg = self.config
        return bool(cfg.get("agent_id") and (cfg.get("api_token") or cfg.get("personal_token")))

    async def invoke(self, message: str, conversation_id: str = "", model_override: str = "") -> AgentResponse:
        cfg = self.config
        agent_id = cfg["agent_id"]
        model = _normalize_knot_model(model_override or cfg.get("model", "deepseek-v3.1"))
        timeout = cfg.get("timeout", 300)
        url = f"{KNOT_API_BASE}/{agent_id}"

        chat_body: Dict[str, Any] = {
            "input": {
                "message": message,
                "conversation_id": conversation_id,
                "model": model,
                "stream": True,
            }
        }

        # 云工作区
        if cfg.get("workspace_uuid"):
            chat_body["input"]["chat_extra"] = {"agent_client_uuid": cfg["workspace_uuid"]}

        # 认证
        if cfg.get("personal_token"):
            headers = {"x-knot-api-token": cfg["personal_token"], "Content-Type": "application/json"}
        else:
            headers = {
                "x-knot-token": cfg["api_token"],
                "X-Username": cfg.get("username", "eval-platform"),
                "Content-Type": "application/json",
            }

        content_parts = []
        thinking_parts = []
        tool_calls = []
        trajectory_steps: list[TrajectoryStep] = []
        step_index = 0
        current_tool: Dict[str, Any] = {}
        current_tool_args_parts = []
        current_tool_start_ms = 0
        token_usage = {}

        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                async with client.stream("POST", url, json=chat_body, headers=headers) as resp:
                    if resp.status_code >= 400:
                        # Read error body for better diagnostics
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                            if len(error_body) > 2000:
                                break
                        raise httpx.HTTPStatusError(
                            f"{resp.status_code} for url '{url}' | body: {error_body[:1000]}",
                            request=resp.request,
                            response=resp,
                        )
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        line = line.lstrip("data:").strip()
                        if line == "[DONE]":
                            break
                        try:
                            msg = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        msg_type = msg.get("type", "")
                        raw = msg.get("rawEvent", {})
                        elapsed_ms = int((time.time() - start) * 1000)

                        if msg_type == "TEXT_MESSAGE_CONTENT":
                            content_parts.append(raw.get("content", ""))
                            trajectory_steps.append(TrajectoryStep(
                                step_index=step_index, step_type="text_output",
                                content=raw.get("content", ""), timestamp_ms=elapsed_ms,
                            ))
                            step_index += 1
                        elif msg_type == "THINKING_TEXT_MESSAGE_CONTENT":
                            thinking_parts.append(raw.get("content", ""))
                            trajectory_steps.append(TrajectoryStep(
                                step_index=step_index, step_type="thinking",
                                content=raw.get("content", ""), timestamp_ms=elapsed_ms,
                            ))
                            step_index += 1
                        elif msg_type == "TOOL_CALL_START":
                            if current_tool.get("name"):
                                current_tool["arguments"] = "".join(current_tool_args_parts)
                                tool_calls.append(current_tool)
                            current_tool = {
                                "name": raw.get("name", ""),
                                "display_name": raw.get("display_name", raw.get("ch_name", "")),
                                "tool_call_id": raw.get("tool_call_id", ""),
                            }
                            current_tool_args_parts = []
                            current_tool_start_ms = elapsed_ms
                            trajectory_steps.append(TrajectoryStep(
                                step_index=step_index, step_type="tool_call",
                                content=f"调用工具: {raw.get('name', '')}",
                                tool_name=raw.get("name", ""),
                                timestamp_ms=elapsed_ms,
                            ))
                            step_index += 1
                        elif msg_type == "TOOL_CALL_ARGS":
                            current_tool_args_parts.append(raw.get("args", raw.get("content", "")))
                        elif msg_type == "TOOL_CALL_END":
                            pass
                        elif msg_type == "TOOL_CALL_RESULT":
                            result_text = raw.get("result", raw.get("content", raw.get("display_name", "")))
                            tool_result_str = result_text if isinstance(result_text, str) else json.dumps(result_text, ensure_ascii=False)
                            tool_duration = elapsed_ms - current_tool_start_ms if current_tool_start_ms else 0
                            if current_tool.get("name"):
                                current_tool["arguments"] = "".join(current_tool_args_parts)
                                current_tool["result"] = tool_result_str
                                tool_calls.append(current_tool)
                                trajectory_steps.append(TrajectoryStep(
                                    step_index=step_index, step_type="tool_result",
                                    content=tool_result_str[:500],
                                    tool_name=current_tool.get("name", ""),
                                    tool_args="".join(current_tool_args_parts),
                                    tool_result=tool_result_str[:2000],
                                    timestamp_ms=elapsed_ms,
                                    duration_ms=tool_duration,
                                ))
                                step_index += 1
                                current_tool = {}
                                current_tool_args_parts = []
                                current_tool_start_ms = 0
                        elif msg_type == "STEP_FINISHED" and raw.get("step_name") == "call_llm":
                            usage = raw.get("token_usage", {})
                            if usage:
                                token_usage = {
                                    "prompt_tokens": usage.get("prompt_tokens", 0),
                                    "completion_tokens": usage.get("completion_tokens", 0),
                                    "total_tokens": usage.get("total_tokens", 0),
                                }

            # Finalize last pending tool call if not yet appended
            if current_tool.get("name"):
                current_tool["arguments"] = "".join(current_tool_args_parts)
                tool_calls.append(current_tool)

            # Merge consecutive text_output / thinking steps
            merged_steps = _merge_consecutive_steps(trajectory_steps)

            latency_ms = int((time.time() - start) * 1000)
            return AgentResponse(
                content="".join(content_parts),
                thinking="".join(thinking_parts),
                tool_calls=tool_calls,
                trajectory_steps=merged_steps,
                token_usage=token_usage,
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            logger.error("knot_adapter_invoke_failed", error=str(e), agent_id=agent_id)
            return AgentResponse(error=str(e), latency_ms=latency_ms)


def _merge_consecutive_steps(steps: list[TrajectoryStep]) -> list[TrajectoryStep]:
    """合并连续的同类型文本步骤（SSE 流式分片产生的碎片）"""
    if not steps:
        return steps
    merged: list[TrajectoryStep] = []
    for s in steps:
        if (merged and s.step_type == merged[-1].step_type
                and s.step_type in ("text_output", "thinking")
                and not s.tool_name):
            merged[-1].content += s.content
        else:
            merged.append(TrajectoryStep(
                step_index=len(merged), step_type=s.step_type,
                content=s.content, tool_name=s.tool_name,
                tool_args=s.tool_args, tool_result=s.tool_result,
                timestamp_ms=s.timestamp_ms, duration_ms=s.duration_ms,
            ))
    return merged
