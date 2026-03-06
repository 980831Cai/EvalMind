"""智能优化建议 API — Phase 4.2
基于评测历史自动生成优化建议
"""
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import prisma

router = APIRouter(prefix="/insights", tags=["Insights"])


class InsightItem(BaseModel):
    type: str  # prompt_optimization, tool_usage, model_selection, performance, quality
    severity: str  # info, warning, critical
    title: str
    description: str
    suggestion: str
    related_data: Optional[Dict[str, Any]] = None


class InsightsResponse(BaseModel):
    agent_id: str
    agent_name: str
    total_runs: int
    insights: List[InsightItem]
    summary: str


@router.get("/{agent_id}")
async def get_agent_insights(agent_id: str):
    """获取 Agent 的智能优化建议"""
    agent = await prisma.agent.find_unique(where={"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    runs = await prisma.evalrun.find_many(
        where={"agentId": agent_id, "status": "completed"},
        order={"createdAt": "desc"},
        take=20,
    )

    insights: List[InsightItem] = []

    # === 1. 性能趋势分析 ===
    if len(runs) >= 2:
        recent_scores = [r.averageScore for r in runs[:5] if r.averageScore is not None]
        older_scores = [r.averageScore for r in runs[5:10] if r.averageScore is not None]

        if recent_scores and older_scores:
            recent_avg = sum(recent_scores) / len(recent_scores)
            older_avg = sum(older_scores) / len(older_scores)
            change = recent_avg - older_avg

            if change < -0.1:
                insights.append(InsightItem(
                    type="quality",
                    severity="warning",
                    title="评分下降趋势",
                    description=f"最近5次评测平均分 {recent_avg:.2f}，较之前下降 {abs(change):.2f}",
                    suggestion="建议检查最近的 Prompt 变更或模型配置，可通过 Playground 调试定位问题",
                    related_data={"recent_avg": recent_avg, "older_avg": older_avg, "change": change},
                ))
            elif change > 0.1:
                insights.append(InsightItem(
                    type="quality",
                    severity="info",
                    title="评分上升趋势",
                    description=f"最近5次评测平均分 {recent_avg:.2f}，较之前提升 {change:.2f}",
                    suggestion="优化方向正确，建议继续保持当前策略",
                    related_data={"recent_avg": recent_avg, "older_avg": older_avg, "change": change},
                ))

    # === 2. 通过率分析 ===
    if runs:
        pass_rates = []
        for r in runs[:10]:
            if r.totalItems and r.totalItems > 0:
                rate = (r.passedCount or 0) / r.totalItems
                pass_rates.append(rate)

        if pass_rates:
            avg_pass_rate = sum(pass_rates) / len(pass_rates)
            if avg_pass_rate < 0.6:
                insights.append(InsightItem(
                    type="quality",
                    severity="critical",
                    title="通过率偏低",
                    description=f"近期平均通过率仅 {avg_pass_rate:.0%}，低于 60% 阈值",
                    suggestion="建议：1) 检查 System Prompt 是否覆盖了测试场景 2) 调整模型温度 3) 使用 Bad Case 分析失败原因",
                    related_data={"avg_pass_rate": avg_pass_rate},
                ))
            elif avg_pass_rate < 0.8:
                insights.append(InsightItem(
                    type="prompt_optimization",
                    severity="warning",
                    title="通过率有提升空间",
                    description=f"近期平均通过率 {avg_pass_rate:.0%}，建议进一步优化",
                    suggestion="建议使用 Experiment 功能对比不同 Prompt 版本和温度参数",
                    related_data={"avg_pass_rate": avg_pass_rate},
                ))

    # === 3. 延迟分析 ===
    results = []
    for r in runs[:5]:
        batch = await prisma.evalresult.find_many(
            where={"evalRunId": r.id},
            take=50,
        )
        results.extend(batch)

    if results:
        latencies = [r.latencyMs for r in results if r.latencyMs and r.latencyMs > 0]
        if latencies:
            avg_latency = sum(latencies) / len(latencies)
            max_latency = max(latencies)
            p95_idx = int(len(latencies) * 0.95)
            sorted_lat = sorted(latencies)
            p95 = sorted_lat[min(p95_idx, len(sorted_lat) - 1)]

            if avg_latency > 10000:
                insights.append(InsightItem(
                    type="performance",
                    severity="warning",
                    title="响应延迟偏高",
                    description=f"平均延迟 {avg_latency/1000:.1f}s，P95 延迟 {p95/1000:.1f}s",
                    suggestion="建议：1) 考虑使用更快的模型 2) 减少不必要的工具调用 3) 优化 Prompt 减少输出长度",
                    related_data={"avg_ms": avg_latency, "p95_ms": p95, "max_ms": max_latency},
                ))

    # === 4. 工具调用分析 ===
    tool_stats: Dict[str, Dict[str, int]] = {}
    for r in results:
        skills = r.skillsCalled if r.skillsCalled else []
        if isinstance(skills, str):
            skills = json.loads(skills)
        for skill in skills:
            name = skill.get("skill", "unknown") if isinstance(skill, dict) else "unknown"
            if name not in tool_stats:
                tool_stats[name] = {"total": 0, "success": 0, "fail": 0}
            tool_stats[name]["total"] += 1
            has_result = skill.get("result") if isinstance(skill, dict) else None
            if has_result:
                tool_stats[name]["success"] += 1
            else:
                tool_stats[name]["fail"] += 1

    for tool_name, stats in tool_stats.items():
        if stats["total"] > 3 and stats["fail"] / stats["total"] > 0.3:
            insights.append(InsightItem(
                type="tool_usage",
                severity="warning",
                title=f"工具 {tool_name} 失败率偏高",
                description=f"工具 {tool_name} 调用 {stats['total']} 次，失败 {stats['fail']} 次 ({stats['fail']/stats['total']:.0%})",
                suggestion=f"建议检查工具 {tool_name} 的配置和参数格式，可能需要在 Prompt 中增加调用示例",
                related_data={"tool_name": tool_name, **stats},
            ))

    unused_tools = []
    if agent.skills:
        agent_skills = agent.skills if isinstance(agent.skills, list) else []
        for skill in agent_skills:
            skill_name = skill.get("name", "") if isinstance(skill, dict) else ""
            if skill_name and skill_name not in tool_stats:
                unused_tools.append(skill_name)

    if unused_tools:
        insights.append(InsightItem(
            type="tool_usage",
            severity="info",
            title="存在未使用的工具",
            description=f"以下工具在最近评测中从未被调用: {', '.join(unused_tools)}",
            suggestion="建议检查这些工具是否仍然需要，移除不必要的工具可以减少模型的选择复杂度",
            related_data={"unused_tools": unused_tools},
        ))

    # === 5. 模型选择建议 ===
    model_scores: Dict[str, List[float]] = {}
    model_costs: Dict[str, List[float]] = {}
    for r in runs:
        model = r.modelOverride or "default"
        if r.averageScore is not None:
            if model not in model_scores:
                model_scores[model] = []
            model_scores[model].append(r.averageScore)

    if len(model_scores) >= 2:
        model_avgs = {m: sum(s)/len(s) for m, s in model_scores.items()}
        best_model = max(model_avgs, key=model_avgs.get)
        worst_model = min(model_avgs, key=model_avgs.get)
        if model_avgs[best_model] - model_avgs[worst_model] > 0.1:
            insights.append(InsightItem(
                type="model_selection",
                severity="info",
                title="模型表现差异明显",
                description=f"最优模型 {best_model} 平均分 {model_avgs[best_model]:.2f}，最差 {worst_model} 平均分 {model_avgs[worst_model]:.2f}",
                suggestion=f"建议优先使用 {best_model}，或通过 Experiment 进一步验证",
                related_data={"model_avgs": model_avgs},
            ))

    # === 6. 成本效益分析 ===
    for r in results:
        cost_data = r.costData
        if isinstance(cost_data, str):
            try:
                cost_data = json.loads(cost_data)
            except (json.JSONDecodeError, TypeError):
                cost_data = None
        if cost_data and isinstance(cost_data, dict):
            total_cost = cost_data.get("total_cost", 0)
            agent_cost = cost_data.get("agent_cost", {})
            model = agent_cost.get("model", "unknown") if isinstance(agent_cost, dict) else "unknown"
            model_costs.setdefault(model, []).append(total_cost)

    if len(model_costs) >= 2:
        model_avg_costs = {m: sum(c) / len(c) for m, c in model_costs.items()}
        cheapest = min(model_avg_costs, key=model_avg_costs.get)
        most_expensive = max(model_avg_costs, key=model_avg_costs.get)

        # 结合分数找最佳性价比
        best_ratio_model = None
        best_ratio = 0
        for m in model_avg_costs:
            if m in model_scores and model_avg_costs[m] > 0:
                avg_s = sum(model_scores[m]) / len(model_scores[m])
                ratio = avg_s / model_avg_costs[m]
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_ratio_model = m

        if best_ratio_model and model_avg_costs[most_expensive] > model_avg_costs[cheapest] * 2:
            insights.append(InsightItem(
                type="model_selection",
                severity="info",
                title="成本效益分析",
                description=f"最经济模型: {cheapest} (平均 ${model_avg_costs[cheapest]:.4f}/case)，"
                           f"最贵模型: {most_expensive} (平均 ${model_avg_costs[most_expensive]:.4f}/case)，"
                           f"最佳性价比: {best_ratio_model}",
                suggestion=f"建议优先使用 {best_ratio_model} 以获得最佳性价比",
                related_data={"model_avg_costs": model_avg_costs, "best_ratio_model": best_ratio_model},
            ))

    # === 7. 失败模式分析 ===
    failure_causes: Dict[str, int] = {}
    for r in results:
        if r.passed:
            continue
        fa = r.failureAnalysis
        if isinstance(fa, str):
            try:
                fa = json.loads(fa)
            except (json.JSONDecodeError, TypeError):
                fa = None
        if fa and isinstance(fa, dict):
            cause = fa.get("primary_cause", "unknown")
            failure_causes[cause] = failure_causes.get(cause, 0) + 1

    if failure_causes:
        top_cause = max(failure_causes, key=failure_causes.get)
        total_failures = sum(failure_causes.values())
        top_pct = failure_causes[top_cause] / total_failures if total_failures > 0 else 0

        cause_labels = {
            "tool_selection_error": "工具选择错误",
            "tool_param_error": "工具参数错误",
            "hallucination": "幻觉/虚构信息",
            "reasoning_error": "推理逻辑错误",
            "instruction_violation": "指令违反",
            "incomplete_response": "回答不完整",
            "context_misunderstanding": "上下文理解错误",
            "timeout_or_error": "超时/系统错误",
        }

        insights.append(InsightItem(
            type="quality",
            severity="warning" if top_pct > 0.3 else "info",
            title=f"最常见失败原因: {cause_labels.get(top_cause, top_cause)}",
            description=f"近期 {total_failures} 次失败中，{cause_labels.get(top_cause, top_cause)} 占 {top_pct:.0%} ({failure_causes[top_cause]} 次)",
            suggestion=_get_cause_suggestion(top_cause),
            related_data={"failure_causes": failure_causes, "total_failures": total_failures},
        ))

    # === 生成摘要 ===
    critical_count = sum(1 for i in insights if i.severity == "critical")
    warning_count = sum(1 for i in insights if i.severity == "warning")

    if critical_count > 0:
        summary = f"发现 {critical_count} 个严重问题需要立即关注"
    elif warning_count > 0:
        summary = f"发现 {warning_count} 个优化建议"
    elif insights:
        summary = f"整体表现良好，有 {len(insights)} 条参考建议"
    else:
        summary = "暂无足够数据生成优化建议，请先运行更多评测"

    return {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "total_runs": len(runs),
        "insights": [i.model_dump() for i in insights],
        "summary": summary,
    }


def _get_cause_suggestion(cause: str) -> str:
    """根据失败原因返回优化建议"""
    suggestions = {
        "tool_selection_error": "建议在 System Prompt 中明确每个工具的使用场景和触发条件",
        "tool_param_error": "建议在 Prompt 中增加工具参数格式示例，或添加参数校验",
        "hallucination": "建议启用 RAG 或增加参考资料，限制模型自由发挥；考虑降低 temperature",
        "reasoning_error": "建议拆解复杂任务为多步骤，或使用 CoT 提示技巧引导推理",
        "instruction_violation": "建议在 Prompt 中使用更明确的约束语句，增加输出格式示例",
        "incomplete_response": "建议增加 max_tokens 或在 Prompt 中要求完整回答",
        "context_misunderstanding": "建议优化 Prompt 的上下文描述，确保关键信息突出",
        "timeout_or_error": "建议检查服务稳定性、增加超时时间或优化处理逻辑",
    }
    return suggestions.get(cause, "建议人工检查具体失败案例，分析根本原因")
