"""scoring_engine.py 确定性断言单元测试"""
import pytest
from app.services.scoring_engine import CodeScorer


class TestCodeScorerAssertions:
    """16 种确定性断言测试"""

    def test_contains_pass(self):
        handler = CodeScorer.HANDLERS.get("contains")
        assert handler is not None
        passed, _ = handler("Hello World", "Hello")
        assert passed is True

    def test_contains_fail(self):
        handler = CodeScorer.HANDLERS["contains"]
        passed, _ = handler("Hello World", "xyz")
        assert passed is False

    def test_not_contains_pass(self):
        handler = CodeScorer.HANDLERS["not_contains"]
        passed, _ = handler("Hello World", "xyz")
        assert passed is True

    def test_not_contains_fail(self):
        handler = CodeScorer.HANDLERS["not_contains"]
        passed, _ = handler("Hello World", "Hello")
        assert passed is False

    def test_exact_match_pass(self):
        handler = CodeScorer.HANDLERS["exact_match"]
        passed, _ = handler("Hello World", "Hello World")
        assert passed is True

    def test_exact_match_fail(self):
        handler = CodeScorer.HANDLERS["exact_match"]
        passed, _ = handler("Hello World", "hello world")
        assert passed is False

    def test_starts_with_pass(self):
        handler = CodeScorer.HANDLERS["starts_with"]
        passed, _ = handler("Hello World", "Hello")
        assert passed is True

    def test_starts_with_fail(self):
        handler = CodeScorer.HANDLERS["starts_with"]
        passed, _ = handler("Hello World", "World")
        assert passed is False

    def test_regex_match_pass(self):
        handler = CodeScorer.HANDLERS["regex_match"]
        passed, _ = handler("Hello 123 World", r"\d+")
        assert passed is True

    def test_regex_match_fail(self):
        handler = CodeScorer.HANDLERS["regex_match"]
        passed, _ = handler("Hello World", r"\d+")
        assert passed is False

    def test_regex_match_length_limit(self):
        """正则表达式长度超过 500 字符应被拒绝"""
        handler = CodeScorer.HANDLERS["regex_match"]
        long_pattern = "a" * 501
        passed, reason = handler("test", long_pattern)
        assert passed is False
        assert "过长" in reason

    def test_regex_match_invalid_pattern(self):
        """无效正则表达式应被捕获"""
        handler = CodeScorer.HANDLERS["regex_match"]
        passed, reason = handler("test", "[invalid")
        assert passed is False

    def test_regex_match_redos_safe(self):
        """ReDoS 恶意正则不应挂死进程"""
        handler = CodeScorer.HANDLERS["regex_match"]
        # 经典 ReDoS 模式：(a+)+ 对 "aaa...!" 输入
        passed, _ = handler("a" * 25 + "!", "(a+)+b")
        assert passed is False  # 不匹配但不应超时


class TestCodeScorerRegistration:
    """CodeScorer 注册机制测试"""

    def test_all_handlers_registered(self):
        expected = {
            "contains", "not_contains", "regex_match", "exact_match",
            "starts_with", "ends_with", "length_gte", "length_lte",
            "json_valid", "json_contains_key", "json_value_equals",
            "word_count_gte", "word_count_lte", "not_empty",
            "equals_ignore_case", "numeric_gte",
        }
        registered = set(CodeScorer.HANDLERS.keys())
        for name in expected:
            assert name in registered, f"缺少断言处理器: {name}"
