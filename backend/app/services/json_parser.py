"""三级 JSON 提取 + 评分归一化"""
import json
import re
from typing import Dict, Optional, Any


def extract_json_from_text(text: str) -> Optional[Dict]:
    """三级 JSON 提取策略：
    1. ```json...``` 代码块
    2. 平衡括号匹配最外层 {}
    3. 正则 fallback（贪心匹配）
    """
    if not text or not text.strip():
        return None

    # --- Level 1: ```json 代码块 ---
    code_block_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # --- Level 2: 平衡括号匹配最外层 {} ---
    result = _extract_balanced_json(text)
    if result is not None:
        return result

    # --- Level 3: 正则 fallback ---
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    return None


def _extract_balanced_json(text: str) -> Optional[Dict]:
    """通过括号平衡找到最外层完整的 {} JSON 对象"""
    start = text.find('{')
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(text)):
        ch = text[i]

        if escape_next:
            escape_next = False
            continue

        if ch == '\\' and in_string:
            escape_next = True
            continue

        if ch == '"' and not escape_next:
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                candidate = text[start:i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    return None

    return None


def normalize_scores(result: Dict) -> Dict:
    """统一归一化到 0-1 尺度。

    检测策略：如果 scores 字典中 >50% 的值 >1 → 判定为 0-10 尺度 → 全部 /10
    otherwise 保持原样。
    同样处理 overall_score 和 trajectory_scores / trajectory_overall。
    """
    result = dict(result)  # shallow copy

    # 处理 scores 字段
    if "scores" in result and isinstance(result["scores"], dict):
        scores = result["scores"]
        numeric_values = [v for v in scores.values() if isinstance(v, (int, float))]
        if numeric_values:
            above_one = sum(1 for v in numeric_values if v > 1)
            is_ten_scale = above_one > len(numeric_values) * 0.5
            if is_ten_scale:
                result["scores"] = {
                    k: round(v / 10.0, 4) if isinstance(v, (int, float)) and v > 1 else v
                    for k, v in scores.items()
                }

    # 处理 overall_score
    if "overall_score" in result:
        overall = result["overall_score"]
        if isinstance(overall, (int, float)) and overall > 1:
            result["overall_score_raw"] = overall
            result["overall_score"] = round(overall / 10.0, 4)

    # 处理 trajectory_scores 字段
    if "trajectory_scores" in result and isinstance(result["trajectory_scores"], dict):
        tscores = result["trajectory_scores"]
        numeric_values = [v for v in tscores.values() if isinstance(v, (int, float))]
        if numeric_values:
            above_one = sum(1 for v in numeric_values if v > 1)
            is_ten_scale = above_one > len(numeric_values) * 0.5
            if is_ten_scale:
                result["trajectory_scores"] = {
                    k: round(v / 10.0, 4) if isinstance(v, (int, float)) and v > 1 else v
                    for k, v in tscores.items()
                }

    # 处理 trajectory_overall
    if "trajectory_overall" in result:
        toverall = result["trajectory_overall"]
        if isinstance(toverall, (int, float)) and toverall > 1:
            result["trajectory_overall"] = round(toverall / 10.0, 4)

    return result
