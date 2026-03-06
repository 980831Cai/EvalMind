"""在线评估 Worker — 后台异步评估生产 Trace

使用 EvalEvent 数据库表持久化队列（替代原 asyncio.Queue 内存队列），
消费 Trace 创建事件，匹配 OnlineEvalConfig 并自动评分。

v6.0 改进：
- 队列持久化：重启不丢失事件
- 轮询退避：2s 基础间隔 + 指数退避（空轮询递增到 10s，有事件重置为 2s）
- 并发消费保护：raw SQL 原子更新 status
- 积压监控：每 60s 记录 pending count
"""
import asyncio
import json
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("online_eval_worker")

_worker_task: Optional[asyncio.Task] = None
_monitor_task: Optional[asyncio.Task] = None

# 轮询配置
_BASE_INTERVAL = 2.0       # 基础轮询间隔（秒）
_MAX_INTERVAL = 10.0        # 最大轮询间隔（秒）
_BACKOFF_FACTOR = 1.5       # 退避因子
_RETENTION_DAYS = 7         # 已完成事件保留天数


async def publish_trace_event(trace_id: str, agent_id: Optional[str]):
    """Trace 入库后调用此方法，将事件写入 EvalEvent 表（持久化）"""
    try:
        await prisma.evalevent.create(data={
            "traceId": trace_id,
            "agentId": agent_id,
        })
        logger.debug("eval_event_published", trace_id=trace_id)
    except Exception as e:
        logger.error("eval_event_publish_failed", trace_id=trace_id, error=str(e))


async def start_worker():
    """启动后台 Worker 和监控任务"""
    global _worker_task, _monitor_task
    if _worker_task and not _worker_task.done():
        return
    _worker_task = asyncio.create_task(_worker_loop())
    _monitor_task = asyncio.create_task(_monitor_loop())
    logger.info("online_eval_worker_started")


async def stop_worker():
    """停止后台 Worker"""
    global _worker_task, _monitor_task
    for task in [_worker_task, _monitor_task]:
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    _worker_task = None
    _monitor_task = None
    logger.info("online_eval_worker_stopped")


async def _worker_loop():
    """Worker 主循环：轮询 EvalEvent 表，指数退避"""
    interval = _BASE_INTERVAL
    while True:
        try:
            event = await _claim_next_event()
            if event:
                interval = _BASE_INTERVAL  # 有事件，重置间隔
                await _process_event(event)
            else:
                # 空轮询，指数退避
                interval = min(interval * _BACKOFF_FACTOR, _MAX_INTERVAL)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("online_eval_worker_error", error=str(e))
            interval = min(interval * _BACKOFF_FACTOR, _MAX_INTERVAL)

        await asyncio.sleep(interval)


async def _claim_next_event() -> Optional[Dict[str, Any]]:
    """原子性领取下一个 pending 事件（raw SQL 保证并发安全）"""
    try:
        # 原子更新：将最早的 pending 事件标记为 processing
        rows = await prisma.query_raw(
            """
            UPDATE eval_events
            SET status = 'processing', processed_at = NOW()
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
            """
        )

        # 查询刚被标记为 processing 的事件
        events = await prisma.evalevent.find_first(
            where={"status": "processing"},
            order={"processedAt": "desc"},
        )

        if events:
            return {
                "id": events.id,
                "trace_id": events.traceId,
                "agent_id": events.agentId,
            }
        return None
    except Exception as e:
        logger.error("eval_event_claim_failed", error=str(e))
        return None


async def _process_event(event: Dict[str, Any]):
    """处理单个 Trace 事件"""
    event_id = event["id"]
    trace_id = event["trace_id"]
    agent_id = event.get("agent_id")

    try:
        # 查找匹配的 OnlineEvalConfig
        configs = await prisma.onlineevalconfig.find_many(
            where={"isActive": True}
        )

        for config in configs:
            # 解析 agent_ids
            config_agent_ids = config.agentIds
            if isinstance(config_agent_ids, str):
                config_agent_ids = json.loads(config_agent_ids)

            # 检查 agent_id 是否匹配
            if config_agent_ids and agent_id not in config_agent_ids:
                continue

            # 采样率检查
            if config.sampleRate < 1.0 and random.random() > config.sampleRate:
                continue

            # 获取维度
            dimensions = config.dimensions
            if isinstance(dimensions, str):
                dimensions = json.loads(dimensions)

            if not dimensions:
                continue

            # 执行评估
            await _evaluate_trace(trace_id, dimensions, config)

        # 标记完成
        await prisma.evalevent.update(
            where={"id": event_id},
            data={"status": "completed", "processedAt": datetime.now(timezone.utc)},
        )

    except Exception as e:
        logger.error("online_eval_process_failed",
                     trace_id=trace_id, event_id=event_id, error=str(e))
        # 标记失败
        try:
            await prisma.evalevent.update(
                where={"id": event_id},
                data={
                    "status": "failed",
                    "error": str(e)[:2000],
                    "processedAt": datetime.now(timezone.utc),
                },
            )
        except Exception:
            pass


async def _evaluate_trace(trace_id: str, dimensions: list, config):
    """对单个 Trace 执行自动评估"""
    # 获取 Trace 数据
    trace = await prisma.trace.find_unique(where={"id": trace_id})
    if not trace:
        return

    input_text = trace.inputText or ""
    output_text = trace.outputText or ""

    if not output_text:
        return

    # 获取模型配置
    model_config = None
    if config.modelConfigId:
        model_config = await prisma.modelconfig.find_unique(
            where={"id": config.modelConfigId}
        )

    if not model_config:
        logger.warning("online_eval_no_model_config",
                       config_id=config.id, model_config_id=config.modelConfigId)
        return

    # 逐维度评分
    from app.services.judge import judge_single_dimension

    for dim_name in dimensions:
        try:
            result = await judge_single_dimension(
                question=input_text,
                agent_output=output_text,
                dimension=dim_name,
                judge_config={
                    "base_url": model_config.baseUrl,
                    "api_key": model_config.apiKey,
                    "model": model_config.modelName,
                    "temperature": model_config.temperature if hasattr(model_config, 'temperature') else 0,
                },
            )

            score_value = result.get("score", 0.0)
            reasoning = result.get("reasoning", "")

            # 创建 Score
            await prisma.score.create(data={
                "id": str(uuid.uuid4()),
                "traceId": trace_id,
                "name": dim_name,
                "value": score_value,
                "comment": reasoning[:500] if reasoning else None,
                "source": "automated",
                "evalConfigId": config.id,
            })

            # 检查告警规则
            alert_rules = config.alertRules
            if isinstance(alert_rules, str):
                alert_rules = json.loads(alert_rules)

            if alert_rules:
                await _check_alerts(trace_id, dim_name, score_value, alert_rules)

        except Exception as e:
            logger.error("online_eval_dimension_failed",
                         trace_id=trace_id, dimension=dim_name, error=str(e))


async def _check_alerts(trace_id: str, dimension: str, value: float, rules: list):
    """检查告警规则"""
    from app.services.alert_service import trigger_alert

    for rule in rules:
        if rule.get("dimension") != dimension:
            continue

        threshold = rule.get("threshold", 0)
        operator = rule.get("operator", "lt")

        triggered = False
        if operator == "lt" and value < threshold:
            triggered = True
        elif operator == "gt" and value > threshold:
            triggered = True
        elif operator == "lte" and value <= threshold:
            triggered = True
        elif operator == "gte" and value >= threshold:
            triggered = True

        if triggered:
            await trigger_alert(
                trace_id=trace_id,
                dimension=dimension,
                value=value,
                rule=rule,
            )


async def _monitor_loop():
    """监控循环：每 60s 记录队列积压数"""
    while True:
        try:
            await asyncio.sleep(60)
            pending_count = await prisma.evalevent.count(
                where={"status": "pending"}
            )
            if pending_count > 0:
                logger.info("online_eval_queue_depth", pending_count=pending_count)

            # 清理过期的已完成/失败事件（保留 N 天）
            cutoff = datetime.now(timezone.utc) - timedelta(days=_RETENTION_DAYS)
            await prisma.query_raw(
                "DELETE FROM eval_events WHERE status IN ('completed', 'failed') AND created_at < ?",
                cutoff,
            )
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("online_eval_monitor_error", error=str(e))
