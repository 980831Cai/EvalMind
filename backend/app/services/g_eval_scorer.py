"""G-Eval 评估器 — 基于 G-Eval 论文的自然语言驱动评估

核心思路：
1. 用户用自然语言描述评估标准 (criteria)
2. 系统使用 LLM 自动生成 Chain-of-Thought 评估步骤
3. LLM 按步骤逐步推理后给出评分
4. 适用于主观性评估维度（创意性、礼貌度、专业度等）
"""
import json
from typing import Dict, List, Any, Optional
from app.services.judge import judge_with_llm
from app.core.logging import get_logger

logger = get_logger("g_eval_scorer")

# G-Eval 步骤生成 Prompt
STEP_GENERATION_PROMPT = """你是一个评估方法设计专家。请根据以下评估标准，生成详细的评估步骤。

评估维度名称: {dimension_name}
评估标准描述:
{criteria}

请生成 3-6 个具体的、可操作的评估步骤，每个步骤应该是一个独立的检查点。
步骤应该形成一个完整的 Chain-of-Thought 推理链条。

请严格按 JSON 格式输出:
{{
    "steps": [
        "步骤1: ...",
        "步骤2: ...",
        ...
    ]
}}"""

# G-Eval 评分 Prompt
SCORING_PROMPT = """你是一个专业的 AI 评估专家，请按照以下步骤逐步评估 Agent 的回答。

## 评估维度: {dimension_name}
## 评估标准:
{criteria}

## 评估步骤（请严格按步骤逐一推理）:
{steps}

## 用户问题
{question}

## Agent 回答
{agent_output}
{expected_section}
请逐步执行上述评估步骤，对每一步给出具体分析，最后综合给出 0-10 的整数评分。

请严格按 JSON 格式输出:
{{
    "step_analysis": [
        {{"step": "步骤1", "analysis": "具体分析...", "sub_score": 0-10}},
        ...
    ],
    "scores": {{"{dimension_name}": 最终评分(0-10整数)}},
    "overall_score": 最终评分,
    "reasoning": "综合评价"
}}"""


class GEvalScorer:
    """G-Eval 评估器：自然语言定义 → 自动生成步骤 → 逐步推理评分"""

    async def generate_steps(
        self,
        dimension_name: str,
        criteria: str,
        judge_config: Optional[Dict] = None,
    ) -> List[str]:
        """根据评估标准自动生成评估步骤"""
        prompt = STEP_GENERATION_PROMPT.format(
            dimension_name=dimension_name,
            criteria=criteria,
        )
        result = await judge_with_llm(prompt, judge_config=judge_config)
        reasoning = result.get("reasoning", "")

        # 尝试从结果中解析步骤
        steps = result.get("steps", [])
        if not steps and reasoning:
            try:
                import re
                json_match = re.search(r'\{[\s\S]*\}', reasoning)
                if json_match:
                    parsed = json.loads(json_match.group())
                    steps = parsed.get("steps", [])
            except (json.JSONDecodeError, AttributeError):
                pass

        if not steps:
            # fallback: 使用默认步骤
            steps = [
                f"步骤1: 仔细阅读用户问题和 Agent 回答",
                f"步骤2: 根据评估标准「{criteria[:50]}」进行分析",
                f"步骤3: 综合评估给出评分",
            ]

        return steps

    async def score(
        self,
        question: str,
        agent_output: str,
        dimension_name: str,
        criteria: str,
        expected_output: str = "",
        steps: Optional[List[str]] = None,
        judge_config: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """执行 G-Eval 评分"""
        # 如果没有预生成步骤，先生成
        if not steps:
            steps = await self.generate_steps(dimension_name, criteria, judge_config)

        steps_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps))
        expected_section = f"\n## 参考答案\n{expected_output}\n" if expected_output else ""

        prompt = SCORING_PROMPT.format(
            dimension_name=dimension_name,
            criteria=criteria,
            steps=steps_text,
            question=question,
            agent_output=agent_output,
            expected_section=expected_section,
        )

        result = await judge_with_llm(prompt, judge_config=judge_config)
        scores = result.get("scores", {})
        score_val = scores.get(dimension_name, result.get("overall_score", 0))

        return {
            "scores": {dimension_name: score_val},
            "overall_score": score_val,
            "reasoning": result.get("reasoning", ""),
            "step_analysis": result.get("step_analysis", []),
            "generated_steps": steps,
        }
