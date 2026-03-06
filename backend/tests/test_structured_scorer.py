"""structured_scorer.py 结构化度量评分器测试"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.structured_scorer import StructuredScorer


@pytest.fixture
def scorer():
    return StructuredScorer()


class TestStructuredScorerRegistration:
    """维度注册机制测试"""

    def test_five_dimensions_registered(self):
        expected = {"faithfulness", "answer_relevancy", "accuracy", "completeness", "instruction_following"}
        registered = set(StructuredScorer.DIMENSION_HANDLERS.keys())
        for dim in expected:
            assert dim in registered, f"缺少维度处理器: {dim}"

    def test_unregistered_dimension_fallback(self, scorer):
        """未注册维度应 fallback"""
        with patch("app.services.structured_scorer.judge_single_dimension") as mock_judge:
            mock_judge.return_value = {"score": 0.5, "reasoning": "fallback"}
            # 调用不存在的维度，应走 fallback


class TestFaithfulness:
    """忠实度维度测试"""

    @pytest.mark.asyncio
    async def test_faithfulness_fast_mode(self, scorer):
        """fast_mode 应合并提取+验证为单次调用"""
        mock_result = {
            "claims": ["地球绕太阳转", "月球是行星"],
            "verdicts": [True, False],
            "reasoning": "第二个声明不正确",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("faithfulness", "问题", "回答", fast_mode=True)
            assert result["score"] == 0.5
            assert result["hallucination_rate"] == 0.5
            assert len(result["items"]) == 2
            assert result["verdicts"] == [True, False]
            assert result["method"] == "structured"

    @pytest.mark.asyncio
    async def test_faithfulness_normal_mode(self, scorer):
        """normal mode 应分两次独立调用"""
        extract_result = {"claims": ["声明1", "声明2", "声明3"]}
        verify_result = {"verdicts": [True, True, False], "reasoning": "验证完成"}

        call_count = 0
        async def mock_llm(prompt, config=None, retry=True):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return extract_result
            return verify_result

        with patch.object(scorer, "_llm_extract_json", side_effect=mock_llm):
            result = await scorer.score("faithfulness", "问题", "回答", fast_mode=False)
            assert call_count == 2  # 分两次调用
            assert abs(result["score"] - 0.6667) < 0.01
            assert result["hallucination_rate"] == round(1 - result["score"], 4)

    @pytest.mark.asyncio
    async def test_faithfulness_empty_claims(self, scorer):
        """无事实声明应得满分"""
        with patch.object(scorer, "_llm_extract_json", return_value={"claims": []}):
            result = await scorer.score("faithfulness", "问题", "我不确定", fast_mode=False)
            assert result["score"] == 1.0
            assert result["hallucination_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_faithfulness_all_supported(self, scorer):
        """所有声明都有支撑应得满分"""
        mock_result = {
            "claims": ["声明1", "声明2"],
            "verdicts": [True, True],
            "reasoning": "全部正确",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("faithfulness", "问题", "回答", fast_mode=True)
            assert result["score"] == 1.0


class TestAnswerRelevancy:
    """回答相关度维度测试"""

    @pytest.mark.asyncio
    async def test_answer_relevancy_full_match(self, scorer):
        mock_result = {
            "inferred_questions": ["问题1", "问题2", "问题3"],
            "equivalence": [True, True, True],
            "reasoning": "完全相关",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("answer_relevancy", "问题", "回答")
            assert result["score"] == 1.0

    @pytest.mark.asyncio
    async def test_answer_relevancy_partial_match(self, scorer):
        mock_result = {
            "inferred_questions": ["问题1", "问题2", "问题3"],
            "equivalence": [True, False, False],
            "reasoning": "部分相关",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("answer_relevancy", "问题", "回答")
            assert abs(result["score"] - 0.3333) < 0.01


class TestAccuracy:
    """准确性维度测试"""

    @pytest.mark.asyncio
    async def test_accuracy_no_reference(self, scorer):
        """无参考答案应 fallback"""
        with patch("app.services.structured_scorer.judge_single_dimension") as mock:
            mock.return_value = {"score": 0.7, "reasoning": "fallback"}
            result = await scorer.score("accuracy", "问题", "回答", expected_output="")
            assert result["method"] == "llm_fallback"

    @pytest.mark.asyncio
    async def test_accuracy_all_correct(self, scorer):
        mock_result = {
            "statements": ["声明1", "声明2"],
            "correct": [True, True],
            "reasoning": "全部正确",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("accuracy", "问题", "回答", expected_output="参考", fast_mode=True)
            assert result["score"] == 1.0


class TestCompleteness:
    """完整性维度测试"""

    @pytest.mark.asyncio
    async def test_completeness_full_coverage(self, scorer):
        mock_result = {
            "aspects": ["方面1", "方面2"],
            "covered": [True, True],
            "reasoning": "完全覆盖",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("completeness", "多方面问题", "全面回答", fast_mode=True)
            assert result["score"] == 1.0

    @pytest.mark.asyncio
    async def test_completeness_partial_coverage(self, scorer):
        mock_result = {
            "aspects": ["方面1", "方面2", "方面3", "方面4"],
            "covered": [True, True, False, False],
            "reasoning": "部分覆盖",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("completeness", "问题", "回答", fast_mode=True)
            assert result["score"] == 0.5


class TestInstructionFollowing:
    """指令遵循维度测试"""

    @pytest.mark.asyncio
    async def test_instruction_following_all_followed(self, scorer):
        mock_result = {
            "constraints": ["用中文回答", "不超过100字"],
            "followed": [True, True],
            "reasoning": "全部遵循",
        }
        with patch.object(scorer, "_llm_extract_json", return_value=mock_result):
            result = await scorer.score("instruction_following", "用中文回答不超过100字", "中文短回答", fast_mode=True)
            assert result["score"] == 1.0

    @pytest.mark.asyncio
    async def test_instruction_following_no_constraints(self, scorer):
        """无约束条件应得满分"""
        with patch.object(scorer, "_llm_extract_json", return_value={"constraints": []}):
            result = await scorer.score("instruction_following", "简单问题", "回答", fast_mode=False)
            assert result["score"] == 1.0


class TestFallback:
    """Fallback 机制测试"""

    @pytest.mark.asyncio
    async def test_json_parse_failure_fallback(self, scorer):
        """JSON 解析失败应 fallback 到 LLM"""
        with patch.object(scorer, "_llm_extract_json", return_value=None):
            with patch("app.services.structured_scorer.judge_single_dimension") as mock_judge:
                mock_judge.return_value = {"score": 0.6, "reasoning": "fallback"}
                result = await scorer.score("faithfulness", "问题", "回答", fast_mode=True)
                assert result["method"] == "llm_fallback"
