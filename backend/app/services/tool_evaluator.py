"""细粒度工具调用评估：逐步对比 actual vs expected 轨迹"""
import json
from typing import Dict, List, Any, Optional

from app.core.logging import get_logger

logger = get_logger("tool_evaluator")


def evaluate_tool_calls_fine_grained(
    actual_trajectory: List[Dict],
    expected_trajectory: List[Dict],
) -> Dict[str, Any]:
    """逐步对比工具调用：
    1. 对齐 actual vs expected（按工具名+顺序）
    2. 逐个比对参数（JSON deep diff）
    3. 返回：tool_selection_accuracy, param_accuracy, order_accuracy, step_results[]
    """
    actual_calls = [
        s for s in actual_trajectory
        if s.get("step_type") == "tool_call" or s.get("type") == "tool_call"
    ]
    expected_calls = list(expected_trajectory)

    if not expected_calls:
        return {
            "tool_selection_accuracy": None,
            "param_accuracy": None,
            "order_accuracy": None,
            "step_results": [],
            "summary": "无期望工具调用轨迹",
        }

    step_results = []
    matched_count = 0
    param_matches = 0
    param_total = 0

    # 按顺序逐步比对
    for i, expected in enumerate(expected_calls):
        exp_name = expected.get("tool_name", expected.get("name", ""))
        exp_args = expected.get("tool_args", expected.get("arguments", ""))

        # 尝试找到对应的 actual call
        actual = actual_calls[i] if i < len(actual_calls) else None
        act_name = ""
        act_args = ""

        if actual:
            act_name = actual.get("tool_name", actual.get("name", ""))
            act_args = actual.get("tool_args", actual.get("arguments", ""))

        name_match = act_name == exp_name
        if name_match:
            matched_count += 1

        # 参数比对
        args_match = _compare_args(act_args, exp_args)
        if name_match:
            param_total += 1
            if args_match:
                param_matches += 1

        step_results.append({
            "step_index": i,
            "expected_tool": exp_name,
            "actual_tool": act_name,
            "name_match": name_match,
            "args_match": args_match,
            "expected_args_preview": str(exp_args)[:200],
            "actual_args_preview": str(act_args)[:200],
        })

    # 计算指标
    tool_selection_accuracy = round(matched_count / len(expected_calls), 4) if expected_calls else 0
    param_accuracy = round(param_matches / param_total, 4) if param_total > 0 else None

    # 顺序准确度：通过 LCS 计算
    actual_names = [
        s.get("tool_name", s.get("name", ""))
        for s in actual_calls
    ]
    expected_names = [
        s.get("tool_name", s.get("name", ""))
        for s in expected_calls
    ]
    order_accuracy = _lcs_ratio(expected_names, actual_names)

    return {
        "tool_selection_accuracy": tool_selection_accuracy,
        "param_accuracy": param_accuracy,
        "order_accuracy": order_accuracy,
        "total_expected": len(expected_calls),
        "total_actual": len(actual_calls),
        "matched": matched_count,
        "step_results": step_results,
    }


def _compare_args(actual_args: Any, expected_args: Any) -> bool:
    """比较工具调用参数，支持字符串和 JSON 对象"""
    if not expected_args:
        return True  # 未指定期望参数视为匹配

    try:
        actual_parsed = json.loads(actual_args) if isinstance(actual_args, str) else actual_args
        expected_parsed = json.loads(expected_args) if isinstance(expected_args, str) else expected_args

        if isinstance(actual_parsed, dict) and isinstance(expected_parsed, dict):
            # 只检查 expected 中指定的 key
            for key, exp_val in expected_parsed.items():
                act_val = actual_parsed.get(key)
                if act_val != exp_val:
                    return False
            return True
    except (json.JSONDecodeError, TypeError):
        pass

    # 回退到字符串比较
    return str(actual_args).strip() == str(expected_args).strip()


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
    return round(lcs_len / max(m, n), 4)
