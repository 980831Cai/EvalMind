"""结构化度量评分器 — 提取 + 验证 + 公式化算分

v6.0 核心创新：将 6 个核心维度从"主观 LLM 打分"升级为"结构化度量"。
LLM 负责提取和验证，Python 公式负责算分，提升可解释性和可信度。

维度设计（根据团队评审修正）：
- faithfulness：claims 提取验证 + hallucination 双视图（合并原 hallucination 维度）
- answer_relevancy：反推问题 + binary 语义等价判断
- accuracy：重定义为正确性验证（非覆盖率）
- completeness：要点覆盖率
- instruction_following：约束条件遵循率

关键设计决策：
- 提取和验证分两次独立 LLM 调用，避免自我确认偏差
- 支持 fast_mode 合并为单次调用（用户自主选择速度 vs 质量）
- Fallback 区分三种失败类型（JSON 解析失败/API 超时/部分成功）
"""
import asyncio
from typing import Dict, List, Any, Optional, Callable

from app.services.judge import judge_with_llm
from app.services.json_parser import extract_json_from_text
from app.core.logging import get_logger

logger = get_logger("structured_scorer")


class StructuredScorer:
    """结构化度量评分器：提取 + 验证 + 公式化算分（5 个核心维度）"""

    DIMENSION_HANDLERS: Dict[str, Callable] = {}

    @classmethod
    def register(cls, dimension_name: str):
        """装饰器注册维度处理器"""
        def decorator(func):
            cls.DIMENSION_HANDLERS[dimension_name] = func
            return func
        return decorator

    async def score(
        self,
        dimension_name: str,
        question: str,
        agent_output: str,
        expected_output: str = "",
        context: str = "",
        judge_config: Optional[Dict] = None,
        fast_mode: bool = False,
    ) -> Dict[str, Any]:
        """返回结构化评分结果"""
        handler = self.DIMENSION_HANDLERS.get(dimension_name)
        if not handler:
            logger.warning("structured_dimension_not_found", dimension=dimension_name)
            return await self._fallback_llm_score(
                dimension_name, question, agent_output, expected_output, judge_config,
                reason="未注册的结构化维度"
            )

        try:
            result = await handler(
                self, question=question, agent_output=agent_output,
                expected_output=expected_output, context=context,
                judge_config=judge_config, fast_mode=fast_mode,
            )
            result["method"] = "structured"
            result["score_10"] = round(result.get("score", 0) * 10)
            return result
        except asyncio.TimeoutError:
            logger.error("structured_scorer_timeout", dimension=dimension_name)
            return {"score": 0, "score_10": 0, "error": "LLM API timeout",
                    "method": "structured", "fallback": False}
        except Exception as e:
            logger.error("structured_scorer_error", dimension=dimension_name, error=str(e))
            return await self._fallback_llm_score(
                dimension_name, question, agent_output, expected_output, judge_config,
                reason=str(e)
            )

    async def _llm_call(self, prompt: str, judge_config: Optional[Dict] = None) -> Dict:
        """执行 LLM 调用并解析 JSON 响应"""
        raw_result = await judge_with_llm(prompt, judge_config)
        return raw_result

    async def _llm_extract_json(
        self, prompt: str, judge_config: Optional[Dict] = None, retry: bool = True
    ) -> Optional[Dict]:
        """执行 LLM 调用，提取 JSON 响应，失败时可重试"""
        try:
            result = await self._llm_call(prompt, judge_config)
            if isinstance(result, dict) and result:
                return result
        except Exception as e:
            logger.warning("structured_llm_extract_failed", error=str(e))

        if retry:
            retry_prompt = prompt + "\n\n请确保返回合法 JSON 格式。不要包含额外文本。"
            try:
                result = await self._llm_call(retry_prompt, judge_config)
                if isinstance(result, dict) and result:
                    return result
            except Exception:
                pass

        return None

    async def _fallback_llm_score(
        self, dimension_name: str, question: str, agent_output: str,
        expected_output: str, judge_config: Optional[Dict],
        reason: str = "",
    ) -> Dict[str, Any]:
        """降级为 LLM 主观打分"""
        logger.info("structured_fallback_to_llm", dimension=dimension_name, reason=reason)
        try:
            from app.services.judge import judge_single_dimension
            result = await judge_single_dimension(
                question=question, agent_output=agent_output,
                dimension=dimension_name, judge_config=judge_config,
            )
            score = result.get("score", 0)
            return {
                "score": score,
                "score_10": round(score * 10) if score <= 1 else round(score),
                "reasoning": result.get("reasoning", ""),
                "method": "llm_fallback",
                "fallback_reason": reason,
                "items": [],
                "verdicts": [],
            }
        except Exception as e:
            logger.error("structured_fallback_failed", dimension=dimension_name, error=str(e))
            return {
                "score": 0, "score_10": 0, "method": "error",
                "error": str(e), "items": [], "verdicts": [],
            }


# ===== 维度处理器注册 =====

@StructuredScorer.register("faithfulness")
async def _score_faithfulness(
    self: StructuredScorer, question: str, agent_output: str,
    expected_output: str = "", context: str = "",
    judge_config: Optional[Dict] = None, fast_mode: bool = False,
) -> Dict[str, Any]:
    """忠实度评分：提取 claims -> 验证支撑 -> supported/total

    合并原 hallucination 维度，返回 hallucination_rate 双视图。
    """
    # 确定验证来源
    reference_source = context or expected_output or question
    context_available = bool(context or expected_output)

    if fast_mode:
        # 合并提取+验证为单次调用
        prompt = f"""你是一个严格的事实核查专家。请分析以下回答的忠实度。

用户问题：{question}

Agent 回答：{agent_output}

参考信息：{reference_source}

请执行以下步骤：
1. 从 Agent 回答中提取所有事实性声明（claims）
2. 逐条验证每个声明是否有参考信息支撑

请返回 JSON 格式：
{{
  "claims": ["声明1", "声明2", ...],
  "verdicts": [true, false, ...],
  "reasoning": "整体分析"
}}

其中 verdicts 与 claims 一一对应，true 表示有支撑，false 表示无支撑或编造。
请确保返回合法 JSON。"""

        result = await self._llm_extract_json(prompt, judge_config)
        if not result:
            return await self._fallback_llm_score(
                "faithfulness", question, agent_output, expected_output, judge_config,
                reason="JSON 解析失败"
            )

        claims = result.get("claims", [])
        verdicts = result.get("verdicts", [])
    else:
        # Step 1: 提取 claims（独立调用）
        extract_prompt = f"""你是一个事实提取专家。请从以下 Agent 回答中提取所有事实性声明。

用户问题：{question}

Agent 回答：{agent_output}

请返回 JSON 格式：
{{
  "claims": ["声明1", "声明2", ...]
}}

要求：
- 每个声明应该是可独立验证的事实性陈述
- 忽略观点性、主观性的表述
- 如果回答中没有事实性声明，返回空列表
请确保返回合法 JSON。"""

        extract_result = await self._llm_extract_json(extract_prompt, judge_config)
        if not extract_result:
            return await self._fallback_llm_score(
                "faithfulness", question, agent_output, expected_output, judge_config,
                reason="提取步骤 JSON 解析失败"
            )

        claims = extract_result.get("claims", [])

        if not claims:
            return {
                "score": 1.0, "items": [], "verdicts": [],
                "reasoning": "回答中未包含可验证的事实性声明",
                "context_available": context_available,
                "hallucination_rate": 0.0,
            }

        # Step 2: 验证 claims（独立调用，避免确认偏差）
        claims_text = "\n".join(f"{i+1}. {c}" for i, c in enumerate(claims))
        verify_prompt = f"""你是一个严格的事实核查专家。请逐条验证以下声明是否有参考信息支撑。

参考信息：{reference_source}

需要验证的声明：
{claims_text}

请返回 JSON 格式：
{{
  "verdicts": [true, false, ...],
  "reasoning": "核查过程分析"
}}

其中 verdicts 与声明一一对应，true 表示有参考信息支撑，false 表示无支撑或与参考信息矛盾。
请确保返回合法 JSON。"""

        verify_result = await self._llm_extract_json(verify_prompt, judge_config)
        if not verify_result:
            # 部分成功：有 claims 但验证失败
            return {
                "score": 0, "score_10": 0, "items": claims, "verdicts": [],
                "reasoning": "验证步骤失败，仅返回提取结果",
                "method": "structured_partial",
                "context_available": context_available,
            }

        verdicts = verify_result.get("verdicts", [])

    # Step 3: 公式计算
    if not claims:
        score = 1.0
    else:
        # 对齐长度
        verdicts = verdicts[:len(claims)]
        while len(verdicts) < len(claims):
            verdicts.append(False)
        supported_count = sum(1 for v in verdicts if v)
        score = supported_count / len(claims)

    return {
        "score": round(score, 4),
        "items": claims,
        "verdicts": verdicts,
        "reasoning": result.get("reasoning", "") if fast_mode else verify_result.get("reasoning", ""),
        "context_available": context_available,
        "hallucination_rate": round(1 - score, 4),
        "fast_mode": fast_mode,
    }


@StructuredScorer.register("answer_relevancy")
async def _score_answer_relevancy(
    self: StructuredScorer, question: str, agent_output: str,
    expected_output: str = "", context: str = "",
    judge_config: Optional[Dict] = None, fast_mode: bool = False,
) -> Dict[str, Any]:
    """回答相关度：反推问题 -> binary 语义等价判断 -> equivalent_count/3"""

    prompt = f"""你是一个语义分析专家。请评估以下 Agent 回答与用户问题的相关度。

用户实际问题：{question}

Agent 回答：{agent_output}

请执行以下步骤：
1. 根据 Agent 的回答，推断 3 个用户可能提出的问题
2. 判断每个推断问题与用户实际问题是否语义等价

请返回 JSON 格式：
{{
  "inferred_questions": ["推断问题1", "推断问题2", "推断问题3"],
  "equivalence": [true, false, true],
  "reasoning": "分析过程"
}}

其中 equivalence 与 inferred_questions 一一对应：
- true：推断问题与实际问题语义等价（问的是同一件事）
- false：推断问题与实际问题语义不等价
请确保返回合法 JSON。"""

    result = await self._llm_extract_json(prompt, judge_config)
    if not result:
        return await self._fallback_llm_score(
            "answer_relevancy", question, agent_output, expected_output, judge_config,
            reason="JSON 解析失败"
        )

    questions = result.get("inferred_questions", [])
    equivalence = result.get("equivalence", [])

    # 对齐长度
    equivalence = equivalence[:len(questions)]
    while len(equivalence) < len(questions):
        equivalence.append(False)

    equivalent_count = sum(1 for e in equivalence if e)
    total = len(questions) if questions else 3
    score = equivalent_count / total

    return {
        "score": round(score, 4),
        "items": questions,
        "verdicts": equivalence,
        "reasoning": result.get("reasoning", ""),
    }


@StructuredScorer.register("accuracy")
async def _score_accuracy(
    self: StructuredScorer, question: str, agent_output: str,
    expected_output: str = "", context: str = "",
    judge_config: Optional[Dict] = None, fast_mode: bool = False,
) -> Dict[str, Any]:
    """准确性评分：提取事实声明 -> 与参考答案比对正确性 -> correct/total

    重定义为正确性验证（而非覆盖率），与 completeness 互补：
    - accuracy："说的对不对"
    - completeness："说的全不全"
    """
    reference = expected_output or context
    if not reference:
        return await self._fallback_llm_score(
            "accuracy", question, agent_output, expected_output, judge_config,
            reason="无参考答案，无法验证正确性"
        )

    if fast_mode:
        prompt = f"""你是一个准确性验证专家。请验证 Agent 回答中事实声明的正确性。

用户问题：{question}

Agent 回答：{agent_output}

参考答案：{reference}

请执行以下步骤：
1. 从 Agent 回答中提取所有事实性声明
2. 逐条与参考答案比对，判断是否正确

请返回 JSON 格式：
{{
  "statements": ["声明1", "声明2", ...],
  "correct": [true, false, ...],
  "reasoning": "验证分析"
}}

其中 correct 与 statements 一一对应，true 表示正确，false 表示错误或不准确。
请确保返回合法 JSON。"""

        result = await self._llm_extract_json(prompt, judge_config)
        if not result:
            return await self._fallback_llm_score(
                "accuracy", question, agent_output, expected_output, judge_config,
                reason="JSON 解析失败"
            )

        statements = result.get("statements", [])
        correct = result.get("correct", [])
        reasoning = result.get("reasoning", "")
    else:
        # Step 1: 提取事实声明
        extract_prompt = f"""你是一个事实提取专家。请从以下 Agent 回答中提取所有事实性声明。

用户问题：{question}

Agent 回答：{agent_output}

请返回 JSON 格式：
{{
  "statements": ["声明1", "声明2", ...]
}}
请确保返回合法 JSON。"""

        extract_result = await self._llm_extract_json(extract_prompt, judge_config)
        if not extract_result:
            return await self._fallback_llm_score(
                "accuracy", question, agent_output, expected_output, judge_config,
                reason="提取步骤 JSON 解析失败"
            )

        statements = extract_result.get("statements", [])
        if not statements:
            return {
                "score": 1.0, "items": [], "verdicts": [],
                "reasoning": "回答中未包含可验证的事实性声明",
            }

        # Step 2: 正确性验证
        stmts_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(statements))
        verify_prompt = f"""你是一个准确性验证专家。请逐条验证以下声明的正确性。

参考答案：{reference}

需要验证的声明：
{stmts_text}

请返回 JSON 格式：
{{
  "correct": [true, false, ...],
  "reasoning": "验证分析"
}}

其中 correct 与声明一一对应，true 表示与参考答案一致/正确，false 表示错误或不准确。
请确保返回合法 JSON。"""

        verify_result = await self._llm_extract_json(verify_prompt, judge_config)
        if not verify_result:
            return {
                "score": 0, "score_10": 0, "items": statements, "verdicts": [],
                "reasoning": "验证步骤失败", "method": "structured_partial",
            }

        correct = verify_result.get("correct", [])
        reasoning = verify_result.get("reasoning", "")

    # Step 3: 公式计算
    if not statements:
        score = 1.0
    else:
        correct = correct[:len(statements)]
        while len(correct) < len(statements):
            correct.append(False)
        correct_count = sum(1 for c in correct if c)
        score = correct_count / len(statements)

    return {
        "score": round(score, 4),
        "items": statements,
        "verdicts": correct,
        "reasoning": reasoning,
        "fast_mode": fast_mode,
    }


@StructuredScorer.register("completeness")
async def _score_completeness(
    self: StructuredScorer, question: str, agent_output: str,
    expected_output: str = "", context: str = "",
    judge_config: Optional[Dict] = None, fast_mode: bool = False,
) -> Dict[str, Any]:
    """完整性评分：从问题提取需回答方面 -> 检查覆盖率 -> answered/total"""

    if fast_mode:
        prompt = f"""你是一个回答完整性评估专家。请评估 Agent 回答的完整性。

用户问题：{question}

Agent 回答：{agent_output}

{"参考答案：" + expected_output if expected_output else ""}

请执行以下步骤：
1. 从用户问题{"和参考答案" if expected_output else ""}中提取需要回答的各个方面/要点
2. 逐一检查 Agent 回答是否涵盖了每个方面

请返回 JSON 格式：
{{
  "aspects": ["方面1", "方面2", ...],
  "covered": [true, false, ...],
  "reasoning": "覆盖分析"
}}

其中 covered 与 aspects 一一对应，true 表示已覆盖，false 表示未覆盖或涵盖不充分。
请确保返回合法 JSON。"""

        result = await self._llm_extract_json(prompt, judge_config)
        if not result:
            return await self._fallback_llm_score(
                "completeness", question, agent_output, expected_output, judge_config,
                reason="JSON 解析失败"
            )

        aspects = result.get("aspects", [])
        covered = result.get("covered", [])
        reasoning = result.get("reasoning", "")
    else:
        # Step 1: 提取需回答的方面
        extract_prompt = f"""你是一个需求分析专家。请从以下问题中提取需要回答的各个方面/要点。

用户问题：{question}

{"参考答案：" + expected_output if expected_output else ""}

请返回 JSON 格式：
{{
  "aspects": ["方面1", "方面2", ...]
}}

要求：每个方面应该是问题中需要被回答的一个独立要点。
请确保返回合法 JSON。"""

        extract_result = await self._llm_extract_json(extract_prompt, judge_config)
        if not extract_result:
            return await self._fallback_llm_score(
                "completeness", question, agent_output, expected_output, judge_config,
                reason="提取步骤 JSON 解析失败"
            )

        aspects = extract_result.get("aspects", [])
        if not aspects:
            return {
                "score": 1.0, "items": [], "verdicts": [],
                "reasoning": "问题未包含明确的需回答方面",
            }

        # Step 2: 检查覆盖
        aspects_text = "\n".join(f"{i+1}. {a}" for i, a in enumerate(aspects))
        verify_prompt = f"""你是一个完整性核查专家。请逐一检查以下方面是否被 Agent 回答涵盖。

Agent 回答：{agent_output}

需要检查的方面：
{aspects_text}

请返回 JSON 格式：
{{
  "covered": [true, false, ...],
  "reasoning": "覆盖分析"
}}

其中 covered 与方面一一对应，true 表示已充分涵盖，false 表示未涵盖或涵盖不充分。
请确保返回合法 JSON。"""

        verify_result = await self._llm_extract_json(verify_prompt, judge_config)
        if not verify_result:
            return {
                "score": 0, "score_10": 0, "items": aspects, "verdicts": [],
                "reasoning": "验证步骤失败", "method": "structured_partial",
            }

        covered = verify_result.get("covered", [])
        reasoning = verify_result.get("reasoning", "")

    # Step 3: 公式计算
    if not aspects:
        score = 1.0
    else:
        covered = covered[:len(aspects)]
        while len(covered) < len(aspects):
            covered.append(False)
        answered_count = sum(1 for c in covered if c)
        score = answered_count / len(aspects)

    return {
        "score": round(score, 4),
        "items": aspects,
        "verdicts": covered,
        "reasoning": reasoning,
        "fast_mode": fast_mode,
    }


@StructuredScorer.register("instruction_following")
async def _score_instruction_following(
    self: StructuredScorer, question: str, agent_output: str,
    expected_output: str = "", context: str = "",
    judge_config: Optional[Dict] = None, fast_mode: bool = False,
) -> Dict[str, Any]:
    """指令遵循评分：提取约束条件 -> 检查遵循 -> followed/total"""

    if fast_mode:
        prompt = f"""你是一个指令遵循评估专家。请评估 Agent 是否遵循了用户指令中的约束条件。

用户问题/指令：{question}

{"系统提示/上下文：" + context if context else ""}

Agent 回答：{agent_output}

请执行以下步骤：
1. 从用户问题和系统提示中提取所有显式约束条件（如格式要求、长度限制、语言要求、内容限制等）
2. 逐条检查 Agent 回答是否遵循了每个约束

请返回 JSON 格式：
{{
  "constraints": ["约束1", "约束2", ...],
  "followed": [true, false, ...],
  "reasoning": "遵循分析"
}}

其中 followed 与 constraints 一一对应，true 表示已遵循，false 表示违反。
请确保返回合法 JSON。"""

        result = await self._llm_extract_json(prompt, judge_config)
        if not result:
            return await self._fallback_llm_score(
                "instruction_following", question, agent_output, expected_output, judge_config,
                reason="JSON 解析失败"
            )

        constraints = result.get("constraints", [])
        followed = result.get("followed", [])
        reasoning = result.get("reasoning", "")
    else:
        # Step 1: 提取约束条件
        extract_prompt = f"""你是一个约束提取专家。请从以下用户指令中提取所有显式约束条件。

用户问题/指令：{question}

{"系统提示/上下文：" + context if context else ""}

请返回 JSON 格式：
{{
  "constraints": ["约束1", "约束2", ...]
}}

要求：
- 只提取显式、明确的约束条件
- 忽略隐含的常识性要求
- 每个约束应该是可独立验证的
请确保返回合法 JSON。"""

        extract_result = await self._llm_extract_json(extract_prompt, judge_config)
        if not extract_result:
            return await self._fallback_llm_score(
                "instruction_following", question, agent_output, expected_output, judge_config,
                reason="提取步骤 JSON 解析失败"
            )

        constraints = extract_result.get("constraints", [])
        if not constraints:
            return {
                "score": 1.0, "items": [], "verdicts": [],
                "reasoning": "指令中未包含显式约束条件",
            }

        # Step 2: 检查遵循
        constraints_text = "\n".join(f"{i+1}. {c}" for i, c in enumerate(constraints))
        verify_prompt = f"""你是一个指令遵循核查专家。请逐条检查以下约束条件是否被 Agent 回答遵循。

Agent 回答：{agent_output}

需要检查的约束条件：
{constraints_text}

请返回 JSON 格式：
{{
  "followed": [true, false, ...],
  "reasoning": "遵循分析"
}}

其中 followed 与约束条件一一对应，true 表示已遵循，false 表示违反。
请确保返回合法 JSON。"""

        verify_result = await self._llm_extract_json(verify_prompt, judge_config)
        if not verify_result:
            return {
                "score": 0, "score_10": 0, "items": constraints, "verdicts": [],
                "reasoning": "验证步骤失败", "method": "structured_partial",
            }

        followed = verify_result.get("followed", [])
        reasoning = verify_result.get("reasoning", "")

    # Step 3: 公式计算
    if not constraints:
        score = 1.0
    else:
        followed = followed[:len(constraints)]
        while len(followed) < len(constraints):
            followed.append(False)
        followed_count = sum(1 for f in followed if f)
        score = followed_count / len(constraints)

    return {
        "score": round(score, 4),
        "items": constraints,
        "verdicts": followed,
        "reasoning": reasoning,
        "fast_mode": fast_mode,
    }
