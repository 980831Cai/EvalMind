"""告警服务 — 处理在线评估触发的告警"""
import json
from typing import Dict, Any, Optional

from app.core.logging import get_logger

logger = get_logger("alert_service")


async def trigger_alert(
    trace_id: str,
    dimension: str,
    value: float,
    rule: Dict[str, Any],
):
    """触发告警

    目前仅记录日志，后续可扩展 webhook、邮件等通知渠道。
    """
    action = rule.get("action", "log")
    target = rule.get("target")
    threshold = rule.get("threshold", 0)
    operator = rule.get("operator", "lt")

    alert_info = {
        "trace_id": trace_id,
        "dimension": dimension,
        "value": value,
        "threshold": threshold,
        "operator": operator,
        "action": action,
    }

    logger.warning("online_eval_alert_triggered", **alert_info)

    if action == "webhook" and target:
        await _send_webhook(target, alert_info)
    elif action == "log":
        pass  # 已经在上面记录日志


async def _send_webhook(url: str, payload: Dict[str, Any]):
    """发送 Webhook 通知"""
    try:
        from app.core.http_client import get_http_client

        client = await get_http_client()
        resp = await client.post(url, json=payload, timeout=10.0)

        if resp.status_code >= 400:
            logger.error("webhook_failed",
                         url=url, status=resp.status_code)
        else:
            logger.info("webhook_sent", url=url)
    except Exception as e:
        logger.error("webhook_error", url=url, error=str(e))
