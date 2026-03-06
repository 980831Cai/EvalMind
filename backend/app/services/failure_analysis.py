"""LLM 失败归因分析"""
from typing import Dict, List, Any, Optional

from app.core.logging import get_logger
from app.services.judge import judge_with_llm

logger = get_logger("failure_analysis")

FAILURE_CATEGORIES = {
    "tool_selection_error",
    "tool_param_error",
    "hallucination",
    "reasoning_error",
    "instruction_violation",
    "incomplete_response",
    "context_misunderstanding",
    "timeout_or_error",
    "other",
}

FAILURE_ANALYSIS_PROMPT = """你是一个 AI Agent 评测分析专家。请分析以下失败案例的根本原因。

## 用户问题
{question}

## 期望输出
{expected_output}

## Agent 实际输出
{agent_output}

## 错误信息
{error_message}

## 失败的断言
{failed_assertions}

## 轨迹摘要
{trajectory_summary}

## 评分
{scores}

请分析失败原因，从以下类别中选择最匹配的一个：
- tool_selection_error: 选择了错误的工具
- tool_param_error: 工具参数错误
- hallucination: 输出包含虚构信息
- reasoning_error: 推理逻辑错误
- instruction_violation: 未遵循指令要求
- incomplete_response: 回答不完整
- context_misunderstanding: 理解错误
- timeout_or_error: 超时或系统错误
- other: 其他原因

请严格按 JSON 格式输出：
{{
    "primary_cause": "类别名",
    "explanation": "详细分析",
    "suggested_fix": "改进建议",
    "confidence": 0.0-1.0
}}
"""


async def analyze_failure(
    question: str,
    expected_output: str,
    agent_output: str,
    error_message: str,
    assertion_results: List[Dict],
    trajectory: List[Dict],
    scores: Dict,
    judge_config: Optional[Dict],
) -> Dict[str, Any]:
    """LLM 归因分析，带规则 fallback"""
    # 1. 快速路径：timeout/error 直接分类
    if error_message:
        lower_err = error_message.lower()
        if "timeout" in lower_err or "timed out" in lower_err:
            return {
                "primary_cause": "timeout_or_error",
                "explanation": f"执行超时: {error_message}",
                "suggested_fix": "增加超时时间或优化 Agent 执行效率",
                "confidence": 0.95,
            }
        if "connection" in lower_err or "refused" in lower_err:
            return {
                "primary_cause": "timeout_or_error",
                "explanation": f"连接错误: {error_message}",
                "suggested_fix": "检查 Agent 服务可用性和网络连接",
                "confidence": 0.95,
            }

    # 2. 规则快速分析
    rule_result = _rule_based_analysis(assertion_results, agent_output, trajectory)
    if rule_result and rule_result.get("confidence", 0) >= 0.8:
        return rule_result

    # 3. LLM 分析
    if judge_config:
        try:
            failed_assertions_text = "\n".join(
                f"- [{a.get('type', '?')}] {a.get('reason', '')}"
                for a in assertion_results
                if not a.get("passed", True)
            ) or "无"

            traj_summary = _summarize_trajectory(trajectory)

            prompt = FAILURE_ANALYSIS_PROMPT.format(
                question=question[:1000],
                expected_output=(expected_output or "未指定")[:500],
                agent_output=(agent_output or "无输出")[:1000],
                error_message=error_message or "无",
                failed_assertions=failed_assertions_text,
                trajectory_summary=traj_summary,
                scores=str(scores)[:500],
            )

            from app.services.json_parser import extract_json_from_text
            result = await judge_with_llm(prompt, judge_config=judge_config)
            reasoning = result.get("reasoning", "")

            # 尝试从 reasoning 中提取 JSON
            parsed = extract_json_from_text(reasoning)
            if parsed and "primary_cause" in parsed:
                if parsed["primary_cause"] in FAILURE_CATEGORIES:
                    return parsed

            # 尝试直接从 result 中获取
            if result.get("primary_cause") in FAILURE_CATEGORIES:
                return {
                    "primary_cause": result["primary_cause"],
                    "explanation": result.get("explanation", reasoning),
                    "suggested_fix": result.get("suggested_fix", ""),
                    "confidence": result.get("confidence", 0.5),
                }
        except Exception as e:
            logger.warning("failure_analysis_llm_error", error=str(e))

    # 4. Fallback：规则分析（低置信度）
    if rule_result:
        return rule_result

    return {
        "primary_cause": "other",
        "explanation": "无法确定具体失败原因",
        "suggested_fix": "建议人工检查失败案例",
        "confidence": 0.1,
    }


def _rule_based_analysis(
    assertion_results: List[Dict],
    agent_output: str,
    trajectory: List[Dict],
) -> Optional[Dict]:
    """基于断言结果的规则分析"""
    if not assertion_results:
        return None

    failed = [a for a in assertion_results if not a.get("passed", True)]
    if not failed:
        return None

    # 检查工具相关断言失败
    tool_failures = [a for a in failed if a.get("type", "") in ("tool_called", "tool_not_called", "tool_count_max", "tool_count_min")]
    if tool_failures:
        return {
            "primary_cause": "tool_selection_error",
            "explanation": f"工具调用断言失败: {tool_failures[0].get('reason', '')}",
            "suggested_fix": "检查 Agent 的工具选择逻辑，确保在 Prompt 中明确工具使用场景",
            "confidence": 0.8,
        }

    # 检查内容匹配断言失败
    content_failures = [a for a in failed if a.get("type", "") in ("contains", "not_contains", "exact_match", "regex_match")]
    if content_failures and not agent_output:
        return {
            "primary_cause": "incomplete_response",
            "explanation": "Agent 未产生输出",
            "suggested_fix": "检查 Agent 是否正确处理输入",
            "confidence": 0.85,
        }

    if content_failures:
        return {
            "primary_cause": "reasoning_error",
            "explanation": f"输出内容不符合预期: {content_failures[0].get('reason', '')}",
            "suggested_fix": "优化 Agent Prompt，增加输出格式和内容要求的指导",
            "confidence": 0.6,
        }

    return None


def _summarize_trajectory(trajectory: List[Dict]) -> str:
    """将轨迹压缩为摘要文本"""
    if not trajectory:
        return "无轨迹数据"

    lines = []
    for s in trajectory[:20]:  # 最多 20 步
        step_type = s.get("step_type", "unknown")
        if step_type == "tool_call":
            lines.append(f"- 调用工具: {s.get('tool_name', '?')}")
        elif step_type == "tool_result":
            result_preview = str(s.get("tool_result", ""))[:100]
            lines.append(f"- 工具结果: {s.get('tool_name', '?')} → {result_preview}")
        elif step_type == "thinking":
            lines.append(f"- 思考: {s.get('content', '')[:100]}")
        elif step_type == "text_output":
            lines.append(f"- 输出: {s.get('content', '')[:100]}")

    if len(trajectory) > 20:
        lines.append(f"... 共 {len(trajectory)} 步")

    return "\n".join(lines)
