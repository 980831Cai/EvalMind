"""eval_engine.py 并发安全和异常处理测试"""
import asyncio
import pytest
from app.services.eval_engine import _update_progress_snapshot


class TestUpdateProgressSnapshot:
    """统一进度快照函数测试"""

    @pytest.mark.asyncio
    async def test_snapshot_passed(self):
        """passed=True 应增加 passed 计数"""
        lock = asyncio.Lock()
        state = {"passed": 0, "failed": 0, "completed": 0, "scores": []}
        snapshot = await _update_progress_snapshot(lock, state, total=10, passed=True, score=0.8)
        assert snapshot["passed"] == 1
        assert snapshot["failed"] == 0
        assert snapshot["completed"] == 1
        assert snapshot["progress"] == 10

    @pytest.mark.asyncio
    async def test_snapshot_failed(self):
        """passed=False 应增加 failed 计数"""
        lock = asyncio.Lock()
        state = {"passed": 0, "failed": 0, "completed": 0, "scores": []}
        snapshot = await _update_progress_snapshot(lock, state, total=5, passed=False, score=0.0)
        assert snapshot["passed"] == 0
        assert snapshot["failed"] == 1
        assert snapshot["completed"] == 1
        assert snapshot["progress"] == 20

    @pytest.mark.asyncio
    async def test_snapshot_immutable(self):
        """快照应为不可变副本，不受后续 state 修改影响"""
        lock = asyncio.Lock()
        state = {"passed": 0, "failed": 0, "completed": 0, "scores": []}
        snapshot = await _update_progress_snapshot(lock, state, total=10, passed=True, score=0.8)

        # 修改 state 不应影响快照
        state["passed"] = 999
        assert snapshot["passed"] == 1

    @pytest.mark.asyncio
    async def test_concurrent_updates(self):
        """并发更新应保证线程安全"""
        lock = asyncio.Lock()
        state = {"passed": 0, "failed": 0, "completed": 0, "scores": []}
        total = 100

        async def update(passed: bool):
            await _update_progress_snapshot(lock, state, total=total, passed=passed, score=0.5)

        # 50 个 passed + 50 个 failed 并发执行
        tasks = [update(i < 50) for i in range(100)]
        await asyncio.gather(*tasks)

        assert state["passed"] == 50
        assert state["failed"] == 50
        assert state["completed"] == 100
        assert len(state["scores"]) == 100

    @pytest.mark.asyncio
    async def test_progress_100_at_completion(self):
        """所有用例完成时进度应为 100%"""
        lock = asyncio.Lock()
        state = {"passed": 0, "failed": 0, "completed": 0, "scores": []}

        for i in range(10):
            snapshot = await _update_progress_snapshot(lock, state, total=10, passed=True, score=0.9)

        assert snapshot["progress"] == 100
