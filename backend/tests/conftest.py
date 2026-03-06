"""pytest 共享 fixtures：Prisma mock、LLM mock、测试工厂函数"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_prisma():
    """Mock Prisma 客户端"""
    with patch("app.core.database.prisma") as mock:
        mock.evalrun = AsyncMock()
        mock.evalresult = AsyncMock()
        mock.evalevent = AsyncMock()
        mock.trace = AsyncMock()
        mock.span = AsyncMock()
        mock.score = AsyncMock()
        mock.onlineevalconfig = AsyncMock()
        mock.modelconfig = AsyncMock()
        mock.evaldimension = AsyncMock()
        mock.evaltemplate = AsyncMock()
        mock.query_raw = AsyncMock(return_value=[])
        yield mock


@pytest.fixture
def mock_judge():
    """Mock LLM judge 调用"""
    with patch("app.services.judge.judge_with_llm") as mock:
        mock.return_value = {
            "scores": {"accuracy": 8, "completeness": 7},
            "overall_score": 7.5,
            "reasoning": "测试推理",
        }
        yield mock


@pytest.fixture
def mock_judge_single():
    """Mock 单维度 judge 调用"""
    with patch("app.services.judge.judge_single_dimension") as mock:
        mock.return_value = {
            "score": 0.8,
            "reasoning": "fallback 测试推理",
        }
        yield mock


@pytest.fixture
def sample_judge_config():
    """测试用 judge 配置"""
    return {
        "base_url": "https://api.test.com/v1",
        "api_key": "test-key",
        "model": "test-model",
        "temperature": 0,
    }


def make_eval_state():
    """创建评测状态工厂"""
    return {
        "passed": 0,
        "failed": 0,
        "completed": 0,
        "scores": [],
        "pass_at_k_data": [],
    }
