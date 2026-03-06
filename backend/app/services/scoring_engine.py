"""统一评分引擎：CodeScorer(确定性断言) + LLMScorer(动态维度) + ScoringEngine(调度)"""
import json
import re
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Any, Optional

from app.services.judge import judge_with_llm, judge_with_consensus, judge_single_dimension, DIMENSION_PROMPTS
from app.core.logging import get_logger

logger = get_logger("scoring_engine")


# ===== 数据类 =====

@dataclass
class AssertionResult:
    type: str
    value: Any
    passed: bool
    reason: str
    critical: bool = False


@dataclass
class ScoringResult:
    dimension_scores: Dict[str, float] = field(default_factory=dict)
    overall_score: float = 0.0
    passed: bool = False
    reasoning: str = ""
    assertion_results: List[AssertionResult] = field(default_factory=list)
    critical_failure: bool = False
    fast_failed: bool = False
    progress_rate: float = 0.0
    sub_goal_results: List[Dict] = field(default_factory=list)
    grounding_accuracy: Optional[float] = None


# ===== CodeScorer: 16 种确定性断言 =====

class CodeScorer:
    """执行确定性断言，零外部依赖，纯 Python 实现"""

    ASSERTION_HANDLERS = {}

    @classmethod
    def register(cls, assertion_type: str):
        def decorator(fn):
            cls.ASSERTION_HANDLERS[assertion_type] = fn
            return fn
        return decorator

    def execute(
        self,
        agent_output: str,
        assertions: List[Dict],
        tool_calls: Optional[List[Dict]] = None,
        latency_ms: int = 0,
        token_usage: Optional[Dict] = None,
    ) -> List[AssertionResult]:
        results = []
        for assertion in assertions:
            a_type = assertion.get("type", "")
            a_value = assertion.get("value")
            a_critical = assertion.get("critical", False)

            handler = self.ASSERTION_HANDLERS.get(a_type)
            if not handler:
                results.append(AssertionResult(
                    type=a_type, value=a_value, passed=False,
                    reason=f"未知断言类型: {a_type}", critical=a_critical,
                ))
                continue

            try:
                passed, reason = handler(
                    agent_output=agent_output,
                    value=a_value,
                    tool_calls=tool_calls or [],
                    latency_ms=latency_ms,
                    token_usage=token_usage or {},
                )
                results.append(AssertionResult(
                    type=a_type, value=a_value, passed=passed,
                    reason=reason, critical=a_critical,
                ))
            except Exception as e:
                logger.warning("assertion_execution_error", assertion_type=a_type, error=str(e))
                results.append(AssertionResult(
                    type=a_type, value=a_value, passed=False,
                    reason=f"断言执行异常: {e}", critical=a_critical,
                ))
        return results


# --- 注册 16 种断言 ---

@CodeScorer.register("contains")
def _assert_contains(agent_output: str, value: Any, **_) -> tuple:
    target = str(value)
    if target.lower() in agent_output.lower():
        return True, f"输出包含 '{target}'"
    return False, f"输出不包含 '{target}'"


@CodeScorer.register("not_contains")
def _assert_not_contains(agent_output: str, value: Any, **_) -> tuple:
    target = str(value)
    if target.lower() not in agent_output.lower():
        return True, f"输出不包含 '{target}'（符合预期）"
    return False, f"输出包含了 '{target}'（不应包含）"


@CodeScorer.register("regex_match")
def _assert_regex(agent_output: str, value: Any, **_) -> tuple:
    pattern = str(value)
    # ReDoS 防护：限制正则长度
    if len(pattern) > 500:
        return False, f"正则表达式过长（{len(pattern)} 字符，限制 500）"
    try:
        # 优先使用 google-re2（基于有限自动机，原生无回溯 ReDoS）
        import re2
        if re2.search(pattern, agent_output):
            return True, f"输出匹配正则 '{pattern}'"
        return False, f"输出不匹配正则 '{pattern}'"
    except ImportError:
        # re2 不可用时，降级为标准 re + 编译检查
        try:
            compiled = re.compile(pattern)
        except re.error as e:
            return False, f"无效正则表达式: {e}"
        if compiled.search(agent_output):
            return True, f"输出匹配正则 '{pattern}'"
        return False, f"输出不匹配正则 '{pattern}'"
    except Exception as e:
        return False, f"正则匹配执行异常: {e}"


@CodeScorer.register("exact_match")
def _assert_exact(agent_output: str, value: Any, **_) -> tuple:
    target = str(value).strip()
    if agent_output.strip() == target:
        return True, "输出完全匹配"
    return False, f"输出不完全匹配（期望: {target[:100]}）"


@CodeScorer.register("starts_with")
def _assert_starts(agent_output: str, value: Any, **_) -> tuple:
    target = str(value)
    if agent_output.strip().startswith(target):
        return True, f"输出以 '{target}' 开头"
    return False, f"输出不以 '{target}' 开头"


@CodeScorer.register("ends_with")
def _assert_ends(agent_output: str, value: Any, **_) -> tuple:
    target = str(value)
    if agent_output.strip().endswith(target):
        return True, f"输出以 '{target}' 结尾"
    return False, f"输出不以 '{target}' 结尾"


@CodeScorer.register("json_valid")
def _assert_json(agent_output: str, **_) -> tuple:
    try:
        json.loads(agent_output.strip())
        return True, "输出是合法 JSON"
    except (json.JSONDecodeError, ValueError):
        pass
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', agent_output)
    if json_match:
        try:
            json.loads(json_match.group(1).strip())
            return True, "输出包含合法 JSON 代码块"
        except (json.JSONDecodeError, ValueError):
            pass
    return False, "输出不是合法 JSON"


@CodeScorer.register("max_length")
def _assert_max_len(agent_output: str, value: Any, **_) -> tuple:
    max_len = int(value)
    actual = len(agent_output)
    if actual <= max_len:
        return True, f"输出长度 {actual} <= {max_len}"
    return False, f"输出长度 {actual} 超过最大限制 {max_len}"


@CodeScorer.register("min_length")
def _assert_min_len(agent_output: str, value: Any, **_) -> tuple:
    min_len = int(value)
    actual = len(agent_output)
    if actual >= min_len:
        return True, f"输出长度 {actual} >= {min_len}"
    return False, f"输出长度 {actual} 不足最小要求 {min_len}"


@CodeScorer.register("tool_called")
def _assert_tool_called(tool_calls: List[Dict], value: Any, **_) -> tuple:
    target = str(value)
    called_names = [tc.get("name", tc.get("tool_name", "")) for tc in tool_calls]
    if target in called_names:
        return True, f"工具 '{target}' 已被调用"
    return False, f"工具 '{target}' 未被调用（实际: {called_names}）"


@CodeScorer.register("tool_not_called")
def _assert_tool_not_called(tool_calls: List[Dict], value: Any, **_) -> tuple:
    target = str(value)
    called_names = [tc.get("name", tc.get("tool_name", "")) for tc in tool_calls]
    if target not in called_names:
        return True, f"工具 '{target}' 未被调用（符合预期）"
    return False, f"工具 '{target}' 被调用了（不应调用）"


@CodeScorer.register("tool_count_max")
def _assert_tool_max(tool_calls: List[Dict], value: Any, **_) -> tuple:
    max_count = int(value)
    actual = len(tool_calls)
    if actual <= max_count:
        return True, f"工具调用次数 {actual} <= {max_count}"
    return False, f"工具调用次数 {actual} 超过限制 {max_count}"


@CodeScorer.register("tool_count_min")
def _assert_tool_min(tool_calls: List[Dict], value: Any, **_) -> tuple:
    min_count = int(value)
    actual = len(tool_calls)
    if actual >= min_count:
        return True, f"工具调用次数 {actual} >= {min_count}"
    return False, f"工具调用次数 {actual} 不足 {min_count}"


@CodeScorer.register("latency_max")
def _assert_latency(latency_ms: int, value: Any, **_) -> tuple:
    max_ms = int(value)
    if latency_ms <= max_ms:
        return True, f"延迟 {latency_ms}ms <= {max_ms}ms"
    return False, f"延迟 {latency_ms}ms 超过限制 {max_ms}ms"


@CodeScorer.register("token_max")
def _assert_token(token_usage: Dict, value: Any, **_) -> tuple:
    max_tokens = int(value)
    total = token_usage.get("total", 0)
    if total == 0:
        total = token_usage.get("prompt", 0) + token_usage.get("completion", 0)
    if total <= max_tokens:
        return True, f"Token用量 {total} <= {max_tokens}"
    return False, f"Token用量 {total} 超过限制 {max_tokens}"


# semantic_match 由 LLMScorer 处理，CodeScorer 标记为 pending
@CodeScorer.register("semantic_match")
def _assert_semantic(**_) -> tuple:
    return True, "semantic_match 由 LLMScorer 处理"


# ===== LLMScorer: 动态维度评分 =====

class LLMScorer:
    """从数据库维度定义动态构建 Prompt，调用 LLM 评分"""

    SYSTEM_PROMPT = """你是一个专业的 AI Agent 评测专家。你需要根据给定的维度，对 Agent 的回答进行评分。

评分规则：
- 每个维度打分范围 0-10 分（整数）
- 10分 = 完美，7-9分 = 良好，4-6分 = 一般，1-3分 = 较差，0分 = 完全不合格

评估方法：
1. 仔细阅读用户问题和Agent回答
2. 对每个维度，按照评分标准逐步评估（Chain-of-Thought）
3. 给出评分和理由

反偏见提示：
- 不要因为回答长度而给高分，简洁有效的回答同样优秀
- 不要因为使用了专业术语就认为更好
- 关注实质内容而非表面形式

输出格式要求（严格 JSON）：
{
    "scores": {
        "维度名": 分数,
        ...
    },
    "overall_score": 总分（0-10，各维度加权平均），
    "reasoning": "总体评价和改进建议"
}
"""

    def build_prompt(
        self,
        question: str,
        agent_output: str,
        expected_output: str,
        dimensions: List[Dict],
        tool_calls: Optional[List[Dict]] = None,
    ) -> str:
        # 分离 referenceless 和 reference-required 维度
        ref_dims = []
        noref_dims = []
        for dim in dimensions:
            if not dim.get("requires_reference", True):
                noref_dims.append(dim)
            else:
                ref_dims.append(dim)

        dim_sections = []
        for dim in dimensions:
            name = dim.get("name", "")
            display_name = dim.get("display_name", name)
            criteria = dim.get("scoring_criteria", "")
            steps = dim.get("evaluation_steps", "")
            desc = dim.get("description", DIMENSION_PROMPTS.get(name, name))
            weight = dim.get("weight", 1.0)
            is_noref = not dim.get("requires_reference", True)

            section = f"### {name} ({display_name}) [权重: {weight}]"
            if is_noref:
                section += " [免参考]"
            section += f"\n{desc}\n"
            if criteria:
                section += f"\n评分标准:\n{criteria}\n"
            if steps:
                section += f"\n评估步骤:\n{steps}\n"
            dim_sections.append(section)

        prompt = f"""请评估以下 Agent 的回答质量。

## 用户问题
{question}

## Agent 回答
{agent_output}
"""
        if expected_output:
            prompt += f"""
## 参考答案
{expected_output}
"""
        elif noref_dims:
            prompt += """
注意：本次评估不提供参考答案。对于标记 [免参考] 的维度，请仅基于用户问题和 Agent 回答本身进行评估。
"""
        if tool_calls:
            prompt += f"""
## 工具调用记录
{json.dumps(tool_calls, ensure_ascii=False, indent=2)}
"""
        prompt += f"""
## 评分维度
{''.join(dim_sections)}

请对每个维度逐步推理后给出评分，严格按 JSON 格式输出评分结果。
"""
        return prompt

    async def score(
        self,
        question: str,
        agent_output: str,
        expected_output: str,
        dimensions: List[Dict],
        tool_calls: Optional[List[Dict]] = None,
        judge_config: Optional[Dict] = None,
        enable_multi_judge: bool = False,
        judge_count: int = 3,
    ) -> Dict[str, Any]:
        prompt = self.build_prompt(
            question, agent_output, expected_output, dimensions, tool_calls
        )
        if enable_multi_judge and judge_config:
            result = await judge_with_consensus(prompt, judge_config=judge_config, num_judges=judge_count)
        else:
            result = await judge_with_llm(prompt, judge_config=judge_config)
        return result

    async def evaluate_semantic(
        self,
        agent_output: str,
        expected_value: str,
        judge_config: Optional[Dict] = None,
    ) -> tuple:
        """评估语义匹配断言"""
        prompt = f"""请判断以下两段文本是否语义相似（含义基本一致）。

文本A（Agent输出）:
{agent_output[:2000]}

文本B（期望匹配）:
{expected_value}

请严格按JSON输出: {{"similar": true/false, "reason": "判断理由"}}
"""
        result = await judge_with_llm(prompt, judge_config=judge_config)
        reasoning = result.get("reasoning", "")
        try:
            if isinstance(reasoning, str) and '"similar"' in reasoning:
                parsed = json.loads(re.search(r'\{[^}]+\}', reasoning).group())
                return parsed.get("similar", False), parsed.get("reason", reasoning)
        except Exception:
            logger.warning("semantic_similarity_parse_failed", reasoning=str(reasoning)[:200])
        similar = result.get("similar", False)
        reason = result.get("reason", reasoning)
        return similar, reason


# ===== ScoringEngine: 统一调度 =====

class ScoringEngine:
    """协调 CodeScorer、LLMScorer、GEvalScorer 和 RuleTreeScorer"""

    def __init__(self):
        self.code_scorer = CodeScorer()
        self.llm_scorer = LLMScorer()

    async def score(
        self,
        agent_output: str,
        expected_output: str,
        question: str,
        assertions: Optional[List[Dict]] = None,
        dimensions: Optional[List[Dict]] = None,
        tool_calls: Optional[List[Dict]] = None,
        latency_ms: int = 0,
        token_usage: Optional[Dict] = None,
        judge_config: Optional[Dict] = None,
        pass_threshold: float = 0.6,
        sub_goals: Optional[List[Dict]] = None,
    ) -> ScoringResult:
        result = ScoringResult()
        assertions = assertions or []
        dimensions = dimensions or []

        # --- Phase 1: CodeScorer 确定性断言 ---
        non_semantic = [a for a in assertions if a.get("type") != "semantic_match"]
        semantic_assertions = [a for a in assertions if a.get("type") == "semantic_match"]

        if non_semantic:
            code_results = self.code_scorer.execute(
                agent_output=agent_output,
                assertions=non_semantic,
                tool_calls=tool_calls,
                latency_ms=latency_ms,
                token_usage=token_usage,
            )
            result.assertion_results.extend(code_results)

        # --- Phase 2: 快速失败检查 ---
        critical_failures = [
            r for r in result.assertion_results
            if r.critical and not r.passed
        ]
        if critical_failures:
            result.critical_failure = True
            result.fast_failed = True
            result.passed = False
            result.reasoning = (
                f"关键断言失败 ({len(critical_failures)} 项)，跳过 LLM 评分: "
                + "; ".join(f"[{f.type}] {f.reason}" for f in critical_failures)
            )
            return result

        # --- Phase 3: 按 scoringMethod 分流维度评分 ---
        standard_dims = []
        g_eval_dims = []
        rule_tree_dims = []
        structured_dims = []

        for dim in dimensions:
            method = dim.get("scoring_method", "llm")
            if method == "g_eval":
                g_eval_dims.append(dim)
            elif method == "rule_tree":
                rule_tree_dims.append(dim)
            elif method == "structured":
                structured_dims.append(dim)
            else:
                standard_dims.append(dim)    # llm, hybrid, code 都走标准路径

        # Phase 3a: 标准 LLM/hybrid/code 维度
        if standard_dims:
            llm_result = await self.llm_scorer.score(
                question=question,
                agent_output=agent_output,
                expected_output=expected_output,
                dimensions=standard_dims,
                tool_calls=tool_calls,
                judge_config=judge_config,
            )
            result.dimension_scores = llm_result.get("scores", {})
            result.overall_score = llm_result.get("overall_score", 0)
            result.reasoning = llm_result.get("reasoning", "")

        # Phase 3b: G-Eval 维度（逐维度独立评分）
        if g_eval_dims:
            from app.services.g_eval_scorer import GEvalScorer
            g_scorer = GEvalScorer()
            for dim in g_eval_dims:
                try:
                    g_result = await g_scorer.score(
                        question=question,
                        agent_output=agent_output,
                        dimension_name=dim.get("name", ""),
                        criteria=dim.get("scoring_criteria", dim.get("description", "")),
                        expected_output=expected_output,
                        steps=dim.get("evaluation_steps", "").split("\n") if dim.get("evaluation_steps") else None,
                        judge_config=judge_config,
                    )
                    g_scores = g_result.get("scores", {})
                    result.dimension_scores.update(g_scores)
                except Exception as e:
                    logger.warning("g_eval_score_failed", dimension=dim.get("name"), error=str(e))

        # Phase 3c: 规则树维度（确定性执行）
        if rule_tree_dims:
            from app.services.rule_tree_scorer import RuleTreeScorer
            rt_scorer = RuleTreeScorer()
            for dim in rule_tree_dims:
                try:
                    rule_tree = dim.get("rule_tree")
                    if not rule_tree:
                        continue
                    if isinstance(rule_tree, str):
                        rule_tree = json.loads(rule_tree)
                    rt_result = rt_scorer.evaluate(
                        agent_output=agent_output,
                        rule_tree=rule_tree,
                        tool_calls=tool_calls,
                    )
                    result.dimension_scores[dim.get("name", "")] = rt_result.get("score_10", 0)
                except Exception as e:
                    logger.warning("rule_tree_score_failed", dimension=dim.get("name"), error=str(e))

        # Phase 3d: 结构化度量维度（逐维度独立评分）
        if structured_dims:
            from app.services.structured_scorer import StructuredScorer
            s_scorer = StructuredScorer()
            for dim in structured_dims:
                dim_name = dim.get("name", "")
                try:
                    s_result = await s_scorer.score(
                        dimension_name=dim_name,
                        question=question,
                        agent_output=agent_output,
                        expected_output=expected_output,
                        judge_config=judge_config,
                    )
                    # 结构化评分 0-1 制，转换为 0-10 制与其他维度统一
                    score_10 = s_result.get("score_10", round(s_result.get("score", 0) * 10))
                    result.dimension_scores[dim_name] = score_10
                    logger.info("structured_score_completed",
                                dimension=dim_name, score=s_result.get("score"),
                                method=s_result.get("method"))
                except Exception as e:
                    logger.warning("structured_score_failed", dimension=dim_name, error=str(e))

        # 重新计算 overall_score（如果有 g_eval/rule_tree/structured 维度）
        if (g_eval_dims or rule_tree_dims or structured_dims) and result.dimension_scores:
            total_weight = 0.0
            weighted_sum = 0.0
            for dim in dimensions:
                name = dim.get("name", "")
                weight = dim.get("weight", 1.0)
                if name in result.dimension_scores:
                    weighted_sum += result.dimension_scores[name] * weight
                    total_weight += weight
            if total_weight > 0:
                result.overall_score = round(weighted_sum / total_weight, 2)

        # --- Phase 4: 语义断言 (由 LLMScorer 执行) ---
        for sa in semantic_assertions:
            try:
                similar, reason = await self.llm_scorer.evaluate_semantic(
                    agent_output=agent_output,
                    expected_value=str(sa.get("value", "")),
                    judge_config=judge_config,
                )
                result.assertion_results.append(AssertionResult(
                    type="semantic_match",
                    value=sa.get("value"),
                    passed=similar,
                    reason=reason,
                    critical=sa.get("critical", False),
                ))
            except Exception as e:
                result.assertion_results.append(AssertionResult(
                    type="semantic_match",
                    value=sa.get("value"),
                    passed=False,
                    reason=f"语义匹配评估失败: {e}",
                    critical=sa.get("critical", False),
                ))

        # --- Phase 4.5: 子目标评估 (Progress Rate) ---
        if sub_goals:
            sg_assertions = _sub_goals_to_assertions(sub_goals)
            if sg_assertions:
                sg_results = self.code_scorer.execute(
                    agent_output=agent_output,
                    assertions=sg_assertions,
                    tool_calls=tool_calls,
                    latency_ms=latency_ms,
                    token_usage=token_usage,
                )
                total_weight = sum(sg.get("weight", 1.0) for sg in sub_goals)
                completed_weight = 0.0
                for i, sg_r in enumerate(sg_results):
                    w = sub_goals[i].get("weight", 1.0) if i < len(sub_goals) else 1.0
                    if sg_r.passed:
                        completed_weight += w
                result.progress_rate = round(completed_weight / total_weight, 4) if total_weight > 0 else 0.0
                result.sub_goal_results = [asdict(r) for r in sg_results]

        # --- Phase 5: 综合判定 ---
        all_assertions_passed = all(r.passed for r in result.assertion_results)
        score_passed = result.overall_score >= pass_threshold if dimensions else True

        result.passed = all_assertions_passed and score_passed

        if not all_assertions_passed:
            failed = [r for r in result.assertion_results if not r.passed]
            result.reasoning += f"\n断言失败 ({len(failed)} 项): " + "; ".join(
                f"[{f.type}] {f.reason}" for f in failed
            )

        return result


def assertion_result_to_dict(ar: AssertionResult) -> Dict:
    return asdict(ar)


def scoring_result_to_dict(sr: ScoringResult) -> Dict:
    return {
        "dimension_scores": sr.dimension_scores,
        "overall_score": sr.overall_score,
        "passed": sr.passed,
        "reasoning": sr.reasoning,
        "assertion_results": [assertion_result_to_dict(a) for a in sr.assertion_results],
        "critical_failure": sr.critical_failure,
        "fast_failed": sr.fast_failed,
        "progress_rate": sr.progress_rate,
        "sub_goal_results": sr.sub_goal_results,
        "grounding_accuracy": sr.grounding_accuracy,
    }


def _sub_goals_to_assertions(sub_goals: List[Dict]) -> List[Dict]:
    """将 SubGoal 列表转换为断言列表，供 CodeScorer 执行"""
    assertions = []
    for sg in sub_goals:
        check_type = sg.get("check_type", "contains")
        check_value = sg.get("check_value")
        # 映射 sub_goal check_type 到断言 type
        assertion_type_map = {
            "contains": "contains",
            "tool_called": "tool_called",
            "regex_match": "regex_match",
            "exact_match": "exact_match",
            "llm_judge": "semantic_match",
        }
        a_type = assertion_type_map.get(check_type, check_type)
        assertions.append({
            "type": a_type,
            "value": check_value,
            "critical": False,
        })
    return assertions
