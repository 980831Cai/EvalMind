"""轨迹评估服务：程序化比对 + LLM-as-Judge 混合评估"""
import json
import re
from typing import Dict, List, Any, Optional

from app.services.judge import judge_with_llm
from app.core.logging import get_logger
from app.core.http_client import get_http_client

logger = get_logger("trajectory_judge")


# ===== 轨迹维度定义 =====
TRAJECTORY_DIMENSION_PROMPTS = {
    "trajectory_tool_selection": "工具选择正确性：Agent 在每一步是否选择了最合适的工具，是否存在选错工具的情况",
    "trajectory_param_accuracy": "参数准确性：工具调用的参数是否正确、完整，是否与用户意图一致",
    "trajectory_order": "调用顺序合理性：各步骤的执行顺序是否符合逻辑，是否存在因果倒置",
    "trajectory_efficiency": "执行效率：是否存在冗余/重复的步骤，是否遗漏了必要的步骤",
    "trajectory_error_recovery": "错误恢复能力：遇到工具调用失败或异常时，Agent 是否采取了合理的补救措施",
}

ALL_TRAJECTORY_DIMENSIONS = list(TRAJECTORY_DIMENSION_PROMPTS.keys())

TRAJECTORY_JUDGE_SYSTEM = """你是一个专业的 AI Agent 轨迹评测专家。你需要评估 Agent 执行任务时的完整决策轨迹（而非最终输出）。

评估重点：
- 关注 Agent 的每一步决策是否合理
- 工具调用的选择、参数、顺序是否正确
- 是否有多余或遗漏的步骤
- 遇到错误时的处理是否得当

评分规则：
- 每个维度打分范围 0-10 分（整数）
- 10分 = 完美，7-9分 = 良好，4-6分 = 一般，1-3分 = 较差，0分 = 完全不合格

输出格式要求（严格 JSON）：
{
    "trajectory_scores": {
        "维度名": 分数,
        ...
    },
    "trajectory_overall": 总分（0-10，各维度加权平均），
    "trajectory_reasoning": "轨迹评估总体评价，指出具体哪些步骤做得好、哪些步骤有问题"
}
"""


def _build_trajectory_prompt(
    question: str,
    agent_output: str,
    trajectory_steps: List[Dict[str, Any]],
    expected_tools: Optional[List[str]],
    dimensions: List[str],
) -> str:
    """构建轨迹评估的 LLM Prompt"""
    dim_desc = "\n".join(
        f"- {d}: {TRAJECTORY_DIMENSION_PROMPTS.get(d, d)}" for d in dimensions
    )

    steps_text = ""
    for s in trajectory_steps:
        step_type = s.get("step_type", "unknown")
        idx = s.get("step_index", "?")
        ts = s.get("timestamp_ms", 0)
        dur = s.get("duration_ms", 0)

        if step_type == "thinking":
            steps_text += f"  [{idx}] 🧠 思考 (t={ts}ms): {s.get('content', '')[:300]}\n"
        elif step_type == "tool_call":
            tool_name = s.get("tool_name", "?")
            tool_args = s.get("tool_args", "")
            steps_text += f"  [{idx}] 🔧 调用工具 '{tool_name}' (t={ts}ms)\n"
            if tool_args:
                steps_text += f"       参数: {tool_args[:200]}\n"
        elif step_type == "tool_result":
            tool_name = s.get("tool_name", "?")
            result = s.get("tool_result", s.get("content", ""))
            steps_text += f"  [{idx}] 📋 工具结果 '{tool_name}' (耗时={dur}ms): {str(result)[:300]}\n"
        elif step_type == "text_output":
            steps_text += f"  [{idx}] 💬 文本输出 (t={ts}ms): {s.get('content', '')[:200]}\n"
        else:
            steps_text += f"  [{idx}] ❓ {step_type}: {s.get('content', '')[:200]}\n"

    prompt = f"""请评估以下 Agent 的执行轨迹质量。

## 用户问题
{question}

## Agent 最终输出
{agent_output[:500]}

## 完整执行轨迹（共 {len(trajectory_steps)} 步）
{steps_text}
"""

    if expected_tools:
        prompt += f"""
## 期望使用的工具（参考）
{json.dumps(expected_tools, ensure_ascii=False)}
"""

    prompt += f"""
## 评分维度
{dim_desc}

请根据轨迹中每个步骤的合理性进行综合评分，严格按 JSON 格式输出。
"""
    return prompt


def _programmatic_score(
    trajectory_steps: List[Dict[str, Any]],
    expected_tools: List[str],
) -> Dict[str, Any]:
    """程序化评分：将实际工具调用序列与期望列表进行比对"""
    actual_tools = [
        s.get("tool_name", "")
        for s in trajectory_steps
        if s.get("step_type") == "tool_call" and s.get("tool_name")
    ]

    if not expected_tools:
        return {}

    expected_set = set(expected_tools)
    actual_set = set(actual_tools)

    # 精确率：实际调用的工具中，有多少是期望的
    precision = len(actual_set & expected_set) / len(actual_set) if actual_set else 0
    # 召回率：期望的工具中，有多少被实际调用了
    recall = len(actual_set & expected_set) / len(expected_set) if expected_set else 0
    # F1 分数
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    # 顺序一致性（基于最长公共子序列）
    order_score = _lcs_ratio(expected_tools, actual_tools)

    # 冗余率：多余的工具调用占比
    redundant = len(actual_set - expected_set)
    redundancy_rate = redundant / len(actual_set) if actual_set else 0

    return {
        "tool_precision": round(precision, 3),
        "tool_recall": round(recall, 3),
        "tool_f1": round(f1, 3),
        "order_consistency": round(order_score, 3),
        "redundancy_rate": round(redundancy_rate, 3),
    }


def _lcs_ratio(seq_a: List[str], seq_b: List[str]) -> float:
    """计算两个序列的最长公共子序列比率"""
    if not seq_a or not seq_b:
        return 0.0
    m, n = len(seq_a), len(seq_b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if seq_a[i - 1] == seq_b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    lcs_len = dp[m][n]
    return lcs_len / max(m, n)


def _parse_trajectory_judge_output(text: str) -> Dict[str, Any]:
    """解析 Judge LLM 返回的轨迹评分 JSON"""
    from app.services.json_parser import extract_json_from_text, normalize_scores
    result = extract_json_from_text(text)
    if result and "trajectory_scores" in result:
        result = normalize_scores(result)
        return result
    logger.warning("trajectory_judge_output_parse_fallback", text_preview=text[:200])
    return {
        "trajectory_scores": {},
        "trajectory_overall": 0,
        "trajectory_reasoning": text,
    }


async def evaluate_trajectory(
    question: str,
    agent_output: str,
    trajectory_steps: List[Dict[str, Any]],
    expected_tools: Optional[List[str]] = None,
    dimensions: Optional[List[str]] = None,
    judge_config: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    轨迹评估主入口：程序化评分 + LLM-as-Judge 混合

    Returns:
        {
            "trajectory_scores": {"trajectory_tool_selection": 0.85, ...},
            "trajectory_overall": 0.78,
            "programmatic_scores": {...} | None,
            "trajectory_reasoning": "..."
        }
    """
    if dimensions is None:
        dimensions = ALL_TRAJECTORY_DIMENSIONS

    if not trajectory_steps:
        return {
            "trajectory_scores": {},
            "trajectory_overall": 0,
            "programmatic_scores": None,
            "trajectory_reasoning": "无轨迹数据，跳过轨迹评估",
        }

    # 1. 程序化评分（如果有期望工具列表）
    prog_scores = None
    if expected_tools:
        prog_scores = _programmatic_score(trajectory_steps, expected_tools)

    # 2. LLM-as-Judge 轨迹评分
    prompt = _build_trajectory_prompt(
        question, agent_output, trajectory_steps, expected_tools, dimensions
    )

    llm_result = await _trajectory_judge_with_llm(prompt, judge_config)

    # 3. 融合评分
    traj_scores = llm_result.get("trajectory_scores", {})
    traj_overall = llm_result.get("trajectory_overall", 0)
    traj_reasoning = llm_result.get("trajectory_reasoning", "")

    # 如果有程序化评分，做加权融合（程序化 40%，LLM 60%）
    if prog_scores and traj_overall > 0:
        prog_avg = sum(v for v in [
            prog_scores.get("tool_f1", 0),
            prog_scores.get("order_consistency", 0),
            1 - prog_scores.get("redundancy_rate", 0),
        ]) / 3
        fused_overall = round(traj_overall * 0.6 + prog_avg * 0.4, 3)
    else:
        fused_overall = traj_overall

    return {
        "trajectory_scores": traj_scores,
        "trajectory_overall": fused_overall,
        "programmatic_scores": prog_scores,
        "trajectory_reasoning": traj_reasoning,
        "grounding_accuracy": _compute_grounding_accuracy(trajectory_steps),
    }


def _compute_grounding_accuracy(trajectory_steps: List[Dict]) -> Optional[float]:
    """成功执行的工具调用 / 总工具调用"""
    tool_calls = [s for s in trajectory_steps if s.get("step_type") == "tool_call"]
    if not tool_calls:
        return None
    tool_results = {}
    for s in trajectory_steps:
        if s.get("step_type") == "tool_result":
            tool_results[s.get("tool_name", "")] = s
    success = 0
    for tc in tool_calls:
        r = tool_results.get(tc.get("tool_name", ""))
        if r and "error" not in str(r.get("tool_result", "")).lower()[:500]:
            success += 1
    return round(success / len(tool_calls), 4)


async def _trajectory_judge_with_llm(prompt: str, judge_config: Optional[Dict]) -> Dict[str, Any]:
    """调用 Judge LLM 进行轨迹评估（复用 judge.py 的底层调用逻辑）"""
    from app.core.config import settings

    if judge_config:
        base_url = judge_config.get("base_url", "")
        api_key = judge_config.get("api_key", "")
        model = judge_config.get("model", "")
        temperature = judge_config.get("temperature", 0)
    else:
        base_url = settings.JUDGE_LLM_BASE_URL
        api_key = settings.JUDGE_LLM_API_KEY
        model = settings.JUDGE_LLM_MODEL
        temperature = 0

    if not base_url or not api_key or not model:
        return {
            "trajectory_scores": {},
            "trajectory_overall": 0,
            "trajectory_reasoning": "未配置评分 LLM，无法进行轨迹评估",
        }

    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": TRAJECTORY_JUDGE_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": 2048,
    }

    try:
        client = get_http_client()
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            logger.warning("trajectory_judge_empty_response", model=model)
            return {"trajectory_scores": {}, "trajectory_overall": 0, "trajectory_reasoning": "LLM 返回为空"}
        return _parse_trajectory_judge_output(content)
    except Exception as e:
        logger.error("trajectory_judge_failed", error=str(e), model=model)
        return {
            "trajectory_scores": {},
            "trajectory_overall": 0,
            "trajectory_reasoning": f"轨迹评估失败: {e}",
        }
