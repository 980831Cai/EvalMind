"""改进报告生成服务 - 模板化生成评测改进报告"""
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from collections import Counter

from app.core.database import get_db
from app.services.gene_service import match_genes_by_signals

logger = logging.getLogger("improvement_report")

# 失败类型的中英文描述
FAILURE_LABELS = {
    "hallucination": {"zh": "幻觉/编造", "en": "Hallucination"},
    "tool_selection_error": {"zh": "工具选择错误", "en": "Tool Selection Error"},
    "reasoning_error": {"zh": "推理错误", "en": "Reasoning Error"},
    "incomplete_response": {"zh": "回答不完整", "en": "Incomplete Response"},
    "tool_execution_error": {"zh": "工具执行失败", "en": "Tool Execution Error"},
    "safety_violation": {"zh": "安全违规", "en": "Safety Violation"},
    "format_error": {"zh": "格式错误", "en": "Format Error"},
    "context_misunderstanding": {"zh": "上下文理解偏差", "en": "Context Misunderstanding"},
    "other": {"zh": "其他", "en": "Other"},
}


async def generate_report(eval_run_id: str, lang: str = "zh") -> Dict[str, Any]:
    """生成评测改进报告"""
    db = get_db()

    # 获取评测运行
    run = await db.evalrun.find_unique(
        where={"id": eval_run_id},
        include={"agent": True, "testSuite": True},
    )
    if not run:
        raise ValueError(f"EvalRun not found: {eval_run_id}")

    # 获取所有评测结果
    results = await db.evalresult.find_many(
        where={"evalRunId": eval_run_id},
        order={"overallScore": "asc"},
    )

    if not results:
        raise ValueError(f"No results found for EvalRun: {eval_run_id}")

    # ===== 1. 评测概要 =====
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    avg_score = sum(r.overallScore for r in results) / total if total else 0
    pass_rate = passed / total if total else 0

    # ===== 2. 维度评分分析 =====
    dimension_scores: Dict[str, List[float]] = {}
    for r in results:
        try:
            scores = json.loads(r.scores) if isinstance(r.scores, str) else r.scores
        except (json.JSONDecodeError, TypeError):
            scores = {}
        if isinstance(scores, dict):
            for dim, score in scores.items():
                if isinstance(score, (int, float)):
                    if dim not in dimension_scores:
                        dimension_scores[dim] = []
                    dimension_scores[dim].append(score)

    dimension_analysis = {}
    for dim, scores_list in dimension_scores.items():
        mean = sum(scores_list) / len(scores_list) if scores_list else 0
        dimension_analysis[dim] = {
            "mean": round(mean, 2),
            "min": round(min(scores_list), 2) if scores_list else 0,
            "max": round(max(scores_list), 2) if scores_list else 0,
            "count": len(scores_list),
        }

    # 按均值排序，找出最弱维度
    weak_dimensions = sorted(dimension_analysis.items(), key=lambda x: x[1]["mean"])[:3]

    # ===== 3. 失败模式分析 =====
    failure_counter: Counter = Counter()
    failure_details: Dict[str, List[Dict]] = {}
    for r in results:
        if r.passed:
            continue
        try:
            fa = json.loads(r.failureAnalysis) if isinstance(r.failureAnalysis, str) else r.failureAnalysis
        except (json.JSONDecodeError, TypeError):
            fa = None
        if fa and isinstance(fa, dict):
            cat = fa.get("primary_cause", "other")
            failure_counter[cat] += 1
            if cat not in failure_details:
                failure_details[cat] = []
            if len(failure_details[cat]) < 3:  # 每类最多保存3个示例
                failure_details[cat].append({
                    "input": (r.input[:200] + "...") if len(r.input) > 200 else r.input,
                    "explanation": fa.get("explanation", ""),
                    "suggested_fix": fa.get("suggested_fix", ""),
                })
        else:
            failure_counter["other"] += 1

    failure_patterns = []
    for cat, count in failure_counter.most_common():
        label = FAILURE_LABELS.get(cat, FAILURE_LABELS["other"])
        failure_patterns.append({
            "category": cat,
            "label": label.get(lang, label["en"]),
            "count": count,
            "percentage": round(count / failed * 100, 1) if failed else 0,
            "examples": failure_details.get(cat, []),
        })

    # ===== 4. 推荐策略 =====
    failure_signals = list(failure_counter.keys())
    agent_id = run.agentId
    recommended_genes = await match_genes_by_signals(failure_signals, agent_id)

    # ===== 5. 改进建议 =====
    suggestions = _generate_suggestions(weak_dimensions, failure_patterns, lang)

    # ===== 6. 生成 Markdown =====
    report_md = _render_markdown(
        run=run,
        total=total,
        passed=passed,
        failed=failed,
        avg_score=avg_score,
        pass_rate=pass_rate,
        dimension_analysis=dimension_analysis,
        weak_dimensions=weak_dimensions,
        failure_patterns=failure_patterns,
        suggestions=suggestions,
        recommended_genes=recommended_genes,
        lang=lang,
    )

    report_data = {
        "eval_run_id": eval_run_id,
        "agent_name": run.agent.name if run.agent else "Unknown",
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_cases": total,
            "passed": passed,
            "failed": failed,
            "average_score": round(avg_score, 2),
            "pass_rate": round(pass_rate * 100, 1),
        },
        "dimension_analysis": dimension_analysis,
        "failure_patterns": failure_patterns,
        "suggestions": suggestions,
        "recommended_genes": recommended_genes[:5],
        "markdown": report_md,
    }

    logger.info(f"Improvement report generated for EvalRun {eval_run_id}")
    return report_data


def _generate_suggestions(
    weak_dimensions: List,
    failure_patterns: List[Dict],
    lang: str,
) -> List[Dict[str, str]]:
    """根据评测数据生成改进建议"""
    suggestions = []

    # 基于弱势维度
    for dim_name, dim_stats in weak_dimensions:
        if dim_stats["mean"] < 6.0:
            suggestions.append({
                "priority": "high",
                "category": "dimension",
                "target": dim_name,
                "description": f"维度 {dim_name} 均分仅 {dim_stats['mean']}，显著低于及格线。建议在 System Prompt 中增加关于 {dim_name} 的明确要求和约束。" if lang == "zh"
                    else f"Dimension {dim_name} average score is only {dim_stats['mean']}, significantly below passing threshold. Consider adding explicit requirements for {dim_name} in the System Prompt.",
            })
        elif dim_stats["mean"] < 7.5:
            suggestions.append({
                "priority": "medium",
                "category": "dimension",
                "target": dim_name,
                "description": f"维度 {dim_name} 均分 {dim_stats['mean']}，有提升空间。可以通过增加示例和更明确的指令来改善。" if lang == "zh"
                    else f"Dimension {dim_name} average score is {dim_stats['mean']}, room for improvement. Consider adding examples and clearer instructions.",
            })

    # 基于失败模式
    for pattern in failure_patterns[:3]:
        if pattern["count"] >= 2:
            suggestions.append({
                "priority": "high" if pattern["percentage"] > 30 else "medium",
                "category": "failure_pattern",
                "target": pattern["category"],
                "description": f"失败模式「{pattern['label']}」占失败用例的 {pattern['percentage']}%（{pattern['count']} 个），是当前最突出的问题。" if lang == "zh"
                    else f"Failure pattern '{pattern['label']}' accounts for {pattern['percentage']}% of failures ({pattern['count']} cases), the most prominent issue.",
            })

    return suggestions


def _render_markdown(
    run, total, passed, failed, avg_score, pass_rate,
    dimension_analysis, weak_dimensions, failure_patterns,
    suggestions, recommended_genes, lang,
) -> str:
    """渲染 Markdown 格式报告"""
    agent_name = run.agent.name if run.agent else "Unknown"
    suite_name = run.testSuite.name if run.testSuite else "Unknown"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = []
    lines.append(f"# {'评测改进报告' if lang == 'zh' else 'Evaluation Improvement Report'}")
    lines.append("")
    lines.append(f"> {'生成时间' if lang == 'zh' else 'Generated'}: {now}")
    lines.append("")

    # 评测概要
    lines.append(f"## {'评测概要' if lang == 'zh' else 'Summary'}")
    lines.append("")
    lines.append(f"| {'项目' if lang == 'zh' else 'Item'} | {'值' if lang == 'zh' else 'Value'} |")
    lines.append("|---|---|")
    lines.append(f"| Agent | {agent_name} |")
    lines.append(f"| {'测试套件' if lang == 'zh' else 'Test Suite'} | {suite_name} |")
    lines.append(f"| {'总用例数' if lang == 'zh' else 'Total Cases'} | {total} |")
    lines.append(f"| {'通过/失败' if lang == 'zh' else 'Passed/Failed'} | {passed} / {failed} |")
    lines.append(f"| {'通过率' if lang == 'zh' else 'Pass Rate'} | {round(pass_rate * 100, 1)}% |")
    lines.append(f"| {'平均分' if lang == 'zh' else 'Average Score'} | {round(avg_score, 2)} |")
    lines.append("")

    # 维度评分
    lines.append(f"## {'维度评分分析' if lang == 'zh' else 'Dimension Score Analysis'}")
    lines.append("")
    lines.append(f"| {'维度' if lang == 'zh' else 'Dimension'} | {'均分' if lang == 'zh' else 'Mean'} | {'最低' if lang == 'zh' else 'Min'} | {'最高' if lang == 'zh' else 'Max'} |")
    lines.append("|---|---|---|---|")
    for dim, stats in sorted(dimension_analysis.items(), key=lambda x: x[1]["mean"]):
        emoji = "🔴" if stats["mean"] < 6 else "🟡" if stats["mean"] < 7.5 else "🟢"
        lines.append(f"| {emoji} {dim} | {stats['mean']} | {stats['min']} | {stats['max']} |")
    lines.append("")

    # 失败模式
    if failure_patterns:
        lines.append(f"## {'Top 失败模式' if lang == 'zh' else 'Top Failure Patterns'}")
        lines.append("")
        for i, p in enumerate(failure_patterns[:5], 1):
            lines.append(f"### {i}. {p['label']} ({p['percentage']}%，{p['count']} {'个' if lang == 'zh' else 'cases'})")
            lines.append("")
            if p["examples"]:
                for ex in p["examples"][:2]:
                    lines.append(f"- **{'输入' if lang == 'zh' else 'Input'}**: {ex['input']}")
                    if ex.get("suggested_fix"):
                        lines.append(f"  - **{'建议' if lang == 'zh' else 'Fix'}**: {ex['suggested_fix']}")
                lines.append("")

    # 改进建议
    if suggestions:
        lines.append(f"## {'改进建议' if lang == 'zh' else 'Improvement Suggestions'}")
        lines.append("")
        for i, s in enumerate(suggestions, 1):
            priority_emoji = "🔴" if s["priority"] == "high" else "🟡"
            lines.append(f"{i}. {priority_emoji} **[{s['priority'].upper()}]** {s['description']}")
        lines.append("")

    # 推荐策略
    if recommended_genes:
        lines.append(f"## {'推荐策略' if lang == 'zh' else 'Recommended Strategies'}")
        lines.append("")
        for g in recommended_genes[:5]:
            lines.append(f"- **{g['name']}** (有效性: {g['effectiveness']}/10)")
            lines.append(f"  - {g['description'] or g['prompt_patch'][:100]}")
        lines.append("")

    return "\n".join(lines)
