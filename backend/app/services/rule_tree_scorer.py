"""规则树评估器 — 基于决策树的客观评估

核心思路：
1. 用户定义 if-then 规则树结构
2. 系统按树路径逐层执行规则检查
3. 每个叶子节点有明确的分数
4. 适用于客观性评估（合规检查、格式验证、边界条件等）

规则树 JSON 结构示例:
{
    "type": "and",  // "and" | "or" | "check"
    "children": [
        {
            "type": "check",
            "check": "contains",     // contains, not_contains, regex, length_max, length_min, json_valid, tool_called
            "value": "some text",
            "label": "包含关键信息",
            "score_on_pass": 1.0,
            "score_on_fail": 0.0
        },
        {
            "type": "or",
            "children": [
                {"type": "check", "check": "regex", "value": "\\d{4}-\\d{2}-\\d{2}", "label": "日期格式", "score_on_pass": 1.0, "score_on_fail": 0.0},
                {"type": "check", "check": "contains", "value": "暂无日期", "label": "标注无日期", "score_on_pass": 0.8, "score_on_fail": 0.0}
            ]
        }
    ]
}
"""
import re
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from app.core.logging import get_logger

logger = get_logger("rule_tree_scorer")


@dataclass
class RuleResult:
    """单条规则执行结果"""
    label: str
    passed: bool
    score: float
    reason: str
    children: List["RuleResult"] = field(default_factory=list)


class RuleTreeScorer:
    """规则树评估器：if-then 决策树结构"""

    def evaluate(
        self,
        agent_output: str,
        rule_tree: Dict[str, Any],
        tool_calls: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """执行规则树评估"""
        result = self._evaluate_node(agent_output, rule_tree, tool_calls or [])
        score_10 = round(result.score * 10, 2)  # 转为 0-10 制

        return {
            "score": result.score,
            "score_10": score_10,
            "passed": result.passed,
            "reasoning": result.reason,
            "tree_result": self._result_to_dict(result),
        }

    def _evaluate_node(
        self,
        agent_output: str,
        node: Dict[str, Any],
        tool_calls: List[Dict],
    ) -> RuleResult:
        """递归评估规则树节点"""
        node_type = node.get("type", "check")
        label = node.get("label", node_type)

        if node_type == "check":
            return self._evaluate_check(agent_output, node, tool_calls)

        children = node.get("children", [])
        if not children:
            return RuleResult(label=label, passed=True, score=1.0, reason="空节点，默认通过")

        child_results = [
            self._evaluate_node(agent_output, child, tool_calls)
            for child in children
        ]

        if node_type == "and":
            all_passed = all(r.passed for r in child_results)
            avg_score = sum(r.score for r in child_results) / len(child_results)
            failed = [r for r in child_results if not r.passed]
            reason = "所有规则通过" if all_passed else f"{len(failed)} 条规则未通过"
            return RuleResult(
                label=label, passed=all_passed, score=avg_score,
                reason=reason, children=child_results,
            )

        elif node_type == "or":
            any_passed = any(r.passed for r in child_results)
            max_score = max(r.score for r in child_results)
            passed_labels = [r.label for r in child_results if r.passed]
            reason = f"满足条件: {', '.join(passed_labels)}" if any_passed else "所有备选条件均未通过"
            return RuleResult(
                label=label, passed=any_passed, score=max_score,
                reason=reason, children=child_results,
            )

        return RuleResult(label=label, passed=False, score=0.0, reason=f"未知节点类型: {node_type}")

    def _evaluate_check(
        self,
        agent_output: str,
        node: Dict[str, Any],
        tool_calls: List[Dict],
    ) -> RuleResult:
        """执行单个检查规则"""
        check_type = node.get("check", "contains")
        value = node.get("value", "")
        label = node.get("label", f"{check_type}: {str(value)[:30]}")
        score_pass = node.get("score_on_pass", 1.0)
        score_fail = node.get("score_on_fail", 0.0)

        passed = False
        reason = ""

        try:
            if check_type == "contains":
                target = str(value)
                passed = target.lower() in agent_output.lower()
                reason = f"{'包含' if passed else '不包含'} '{target}'"

            elif check_type == "not_contains":
                target = str(value)
                passed = target.lower() not in agent_output.lower()
                reason = f"{'不包含' if passed else '包含了'} '{target}'"

            elif check_type == "regex":
                pattern = str(value)
                passed = bool(re.search(pattern, agent_output))
                reason = f"{'匹配' if passed else '不匹配'} 正则 '{pattern}'"

            elif check_type == "length_max":
                max_len = int(value)
                actual = len(agent_output)
                passed = actual <= max_len
                reason = f"长度 {actual} {'<=' if passed else '>'} {max_len}"

            elif check_type == "length_min":
                min_len = int(value)
                actual = len(agent_output)
                passed = actual >= min_len
                reason = f"长度 {actual} {'>=' if passed else '<'} {min_len}"

            elif check_type == "json_valid":
                try:
                    json.loads(agent_output.strip())
                    passed = True
                    reason = "输出是合法 JSON"
                except (json.JSONDecodeError, ValueError):
                    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', agent_output)
                    if json_match:
                        try:
                            json.loads(json_match.group(1).strip())
                            passed = True
                            reason = "输出包含合法 JSON 代码块"
                        except (json.JSONDecodeError, ValueError):
                            pass
                    if not passed:
                        reason = "输出不是合法 JSON"

            elif check_type == "tool_called":
                target = str(value)
                called_names = [tc.get("name", tc.get("tool_name", "")) for tc in tool_calls]
                passed = target in called_names
                reason = f"工具 '{target}' {'已调用' if passed else '未调用'}"

            elif check_type == "starts_with":
                target = str(value)
                passed = agent_output.strip().startswith(target)
                reason = f"{'以' if passed else '不以'} '{target}' 开头"

            elif check_type == "ends_with":
                target = str(value)
                passed = agent_output.strip().endswith(target)
                reason = f"{'以' if passed else '不以'} '{target}' 结尾"

            else:
                reason = f"未知检查类型: {check_type}"

        except Exception as e:
            reason = f"规则执行异常: {e}"

        return RuleResult(
            label=label,
            passed=passed,
            score=score_pass if passed else score_fail,
            reason=reason,
        )

    def _result_to_dict(self, result: RuleResult) -> Dict[str, Any]:
        """将 RuleResult 转为可序列化字典"""
        d: Dict[str, Any] = {
            "label": result.label,
            "passed": result.passed,
            "score": result.score,
            "reason": result.reason,
        }
        if result.children:
            d["children"] = [self._result_to_dict(c) for c in result.children]
        return d
