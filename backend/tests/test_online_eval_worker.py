"""online_eval_worker.py 数据库队列测试"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.online_eval_worker import publish_trace_event


class TestPublishTraceEvent:
    """事件发布测试"""

    @pytest.mark.asyncio
    async def test_publish_creates_event(self):
        """publish 应创建 EvalEvent 记录"""
        with patch("app.services.online_eval_worker.prisma") as mock_prisma:
            mock_prisma.evalevent = AsyncMock()
            mock_prisma.evalevent.create = AsyncMock()

            await publish_trace_event("trace-123", "agent-456")

            mock_prisma.evalevent.create.assert_called_once()
            call_data = mock_prisma.evalevent.create.call_args[1]["data"]
            assert call_data["traceId"] == "trace-123"
            assert call_data["agentId"] == "agent-456"

    @pytest.mark.asyncio
    async def test_publish_handles_error(self):
        """publish 失败应记录日志不抛异常"""
        with patch("app.services.online_eval_worker.prisma") as mock_prisma:
            mock_prisma.evalevent = AsyncMock()
            mock_prisma.evalevent.create = AsyncMock(side_effect=Exception("DB error"))

            # 不应抛异常
            await publish_trace_event("trace-123", None)

    @pytest.mark.asyncio
    async def test_publish_nullable_agent_id(self):
        """agent_id 为 None 应正常处理"""
        with patch("app.services.online_eval_worker.prisma") as mock_prisma:
            mock_prisma.evalevent = AsyncMock()
            mock_prisma.evalevent.create = AsyncMock()

            await publish_trace_event("trace-123", None)
            call_data = mock_prisma.evalevent.create.call_args[1]["data"]
            assert call_data["agentId"] is None
