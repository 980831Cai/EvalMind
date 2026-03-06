"""通用 HTTP Agent 适配器

配置示例:
{
    "url": "https://your-agent.com/api/chat",
    "method": "POST",
    "headers": {"Authorization": "Bearer xxx"},
    "request_template": {"message": "{{input}}"},
    "response_path": "data.content",
    "timeout": 120
}
"""
import time
import json
import httpx
from typing import Dict, Any
from app.adapters.base import BaseAdapter, AgentResponse
from app.core.logging import get_logger
from app.core.http_client import get_http_client

logger = get_logger("http_adapter")


def resolve_path(data: Any, path: str) -> str:
    """从嵌套数据中按路径提取值，如 'data.choices[0].message.content'"""
    parts = path.replace("[", ".[").split(".")
    current = data
    for part in parts:
        if not part:
            continue
        if part.startswith("[") and part.endswith("]"):
            idx = int(part[1:-1])
            current = current[idx]
        elif isinstance(current, dict):
            current = current.get(part, "")
        else:
            return ""
    return str(current) if current else ""


def render_template(template: Any, variables: Dict[str, str]) -> Any:
    """递归替换模板中的 {{variable}} 占位符"""
    if isinstance(template, str):
        for key, value in variables.items():
            template = template.replace(f"{{{{{key}}}}}", value)
        return template
    elif isinstance(template, dict):
        return {k: render_template(v, variables) for k, v in template.items()}
    elif isinstance(template, list):
        return [render_template(item, variables) for item in template]
    return template


class HTTPAdapter(BaseAdapter):
    """通用 HTTP 接口适配器"""

    def validate_config(self) -> bool:
        if not self.config.get("url"):
            return False
        # 如果没有提供 request_template，使用默认模板
        if not self.config.get("request_template"):
            self.config["request_template"] = {"message": "{{input}}"}
        return True

    async def invoke(self, message: str, conversation_id: str = "", model_override: str = "") -> AgentResponse:
        url = self.config["url"]
        method = self.config.get("method", "POST").upper()
        headers = self.config.get("headers", {})
        headers.setdefault("Content-Type", "application/json")
        timeout = self.config.get("timeout", 120)
        request_template = self.config["request_template"]
        response_path = self.config.get("response_path", "")

        body = render_template(request_template, {"input": message, "conversation_id": conversation_id})

        start = time.time()
        try:
            client = get_http_client()
            if method == "POST":
                resp = await client.post(url, json=body, headers=headers, timeout=timeout)
            else:
                resp = await client.get(url, params=body, headers=headers, timeout=timeout)
            resp.raise_for_status()
            latency_ms = int((time.time() - start) * 1000)

            data = resp.json()
            content = resolve_path(data, response_path) if response_path else json.dumps(data, ensure_ascii=False)

            return AgentResponse(
                content=content,
                latency_ms=latency_ms,
                raw_response=data
            )
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            logger.error("http_adapter_invoke_failed", url=url, error=str(e))
            return AgentResponse(error=str(e), latency_ms=latency_ms)
