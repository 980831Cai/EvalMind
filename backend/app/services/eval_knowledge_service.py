"""评测知识沉淀服务 - 自动提取评测知识、建立基准线、智能推荐"""
import json
import logging
import math
from typing import Optional, List, Dict, Any
from collections import Counter

from app.core.database import get_db

logger = logging.getLogger("eval_knowledge_service")

# 预设的 Agent 业务类型
AGENT_CATEGORIES = [
    "customer_service",
    "coding",
    "search",
    "writing",
    "data_analysis",
    "general",
]


async def extract_knowledge(eval_run_id: str) -> Optional[Dict[str, Any]]:
    """从一次评测运行中提取知识快照"""
    db = get_db()

    run = await db.evalrun.find_unique(
        where={"id": eval_run_id},
        include={"agent": True},
    )
    if not run or run.status != "completed":
        return None

    agent_category = "general"
    if run.agent:
        agent_category = getattr(run.agent, "agentCategory", "general") or "general"

    # 获取所有评测结果
    results = await db.evalresult.find_many(where={"evalRunId": eval_run_id})
    if not results:
        return None

    total = len(results)
    passed = sum(1 for r in results if r.passed)
    pass_rate = passed / total if total else 0
    overall_score = sum(r.overallScore for r in results) / total if total else 0

    # 失败模式分布
    failure_counter: Counter = Counter()
    for r in results:
        if r.passed:
            continue
        try:
            fa = json.loads(r.failureAnalysis) if isinstance(r.failureAnalysis, str) else r.failureAnalysis
        except (json.JSONDecodeError, TypeError):
            fa = None
        if fa and isinstance(fa, dict):
            failure_counter[fa.get("primary_cause", "other")] += 1
        else:
            failure_counter["other"] += 1

    failed_count = total - passed
    failure_distribution = {}
    for cat, count in failure_counter.items():
        failure_distribution[cat] = round(count / failed_count, 3) if failed_count else 0

    # 维度统计
    dim_values: Dict[str, List[float]] = {}
    for r in results:
        try:
            scores = json.loads(r.scores) if isinstance(r.scores, str) else r.scores
        except (json.JSONDecodeError, TypeError):
            scores = {}
        if isinstance(scores, dict):
            for dim, score in scores.items():
                if isinstance(score, (int, float)):
                    if dim not in dim_values:
                        dim_values[dim] = []
                    dim_values[dim].append(score)

    dimension_stats = {}
    for dim, values in dim_values.items():
        n = len(values)
        mean = sum(values) / n if n else 0
        variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0
        std = math.sqrt(variance)
        dimension_stats[dim] = {
            "mean": round(mean, 3),
            "std": round(std, 3),
            "min": round(min(values), 3) if values else 0,
            "max": round(max(values), 3) if values else 0,
            "count": n,
        }

    # 高区分度断言（分析哪些断言对通过/失败的区分度最高）
    effective_assertions = _analyze_assertion_effectiveness(results)

    # 存储知识
    knowledge = await db.evalknowledge.create(
        data={
            "agentId": run.agentId,
            "agentCategory": agent_category,
            "evalRunId": eval_run_id,
            "failureDistribution": json.dumps(failure_distribution),
            "dimensionStats": json.dumps(dimension_stats),
            "effectiveAssertions": json.dumps(effective_assertions) if effective_assertions else None,
            "totalCases": total,
            "passRate": pass_rate,
            "overallScore": overall_score,
        }
    )

    logger.info(f"Knowledge extracted for EvalRun {eval_run_id}: {total} cases, {len(dimension_stats)} dimensions")
    return _format_knowledge(knowledge)


async def get_baseline(
    agent_category: str = "general",
    agent_id: Optional[str] = None,
) -> Dict[str, Any]:
    """获取基准线（按 Agent 类型或特定 Agent 聚合）"""
    db = get_db()

    where: Dict[str, Any] = {}
    if agent_id:
        where["agentId"] = agent_id
    else:
        where["agentCategory"] = agent_category

    records = await db.evalknowledge.find_many(
        where=where,
        order={"createdAt": "desc"},
        take=50,  # 取最近50次评测的数据聚合
    )

    if not records:
        return {
            "agent_category": agent_category,
            "agent_id": agent_id,
            "sample_count": 0,
            "dimension_baseline": {},
            "failure_baseline": {},
            "overall_baseline": None,
            "pass_rate_baseline": None,
        }

    # 聚合维度基准
    all_dim_stats: Dict[str, List[float]] = {}
    all_failure_dist: Dict[str, List[float]] = {}
    overall_scores = []
    pass_rates = []

    for rec in records:
        try:
            dim_stats = json.loads(rec.dimensionStats) if isinstance(rec.dimensionStats, str) else rec.dimensionStats
        except (json.JSONDecodeError, TypeError):
            dim_stats = {}
        if isinstance(dim_stats, dict):
            for dim, stats in dim_stats.items():
                if isinstance(stats, dict) and "mean" in stats:
                    if dim not in all_dim_stats:
                        all_dim_stats[dim] = []
                    all_dim_stats[dim].append(stats["mean"])

        try:
            fail_dist = json.loads(rec.failureDistribution) if isinstance(rec.failureDistribution, str) else rec.failureDistribution
        except (json.JSONDecodeError, TypeError):
            fail_dist = {}
        if isinstance(fail_dist, dict):
            for cat, ratio in fail_dist.items():
                if cat not in all_failure_dist:
                    all_failure_dist[cat] = []
                all_failure_dist[cat].append(ratio)

        overall_scores.append(rec.overallScore)
        pass_rates.append(rec.passRate)

    # 计算基准线
    dimension_baseline = {}
    for dim, means in all_dim_stats.items():
        n = len(means)
        avg = sum(means) / n if n else 0
        std = math.sqrt(sum((v - avg) ** 2 for v in means) / n) if n > 1 else 0
        dimension_baseline[dim] = {
            "mean": round(avg, 2),
            "std": round(std, 2),
            "sample_count": n,
        }

    failure_baseline = {}
    for cat, ratios in all_failure_dist.items():
        failure_baseline[cat] = {
            "mean_ratio": round(sum(ratios) / len(ratios), 3) if ratios else 0,
            "sample_count": len(ratios),
        }

    n = len(overall_scores)
    return {
        "agent_category": agent_category,
        "agent_id": agent_id,
        "sample_count": len(records),
        "dimension_baseline": dimension_baseline,
        "failure_baseline": failure_baseline,
        "overall_baseline": round(sum(overall_scores) / n, 2) if n else None,
        "pass_rate_baseline": round(sum(pass_rates) / n, 3) if n else None,
    }


async def get_recommendations(agent_id: str) -> Dict[str, Any]:
    """基于历史评测知识生成智能推荐"""
    db = get_db()

    agent = await db.agent.find_unique(where={"id": agent_id})
    if not agent:
        return {"recommendations": []}

    agent_category = getattr(agent, "agentCategory", "general") or "general"

    # 获取该 Agent 的最近评测知识
    recent = await db.evalknowledge.find_many(
        where={"agentId": agent_id},
        order={"createdAt": "desc"},
        take=5,
    )

    # 获取同类基准线
    baseline = await get_baseline(agent_category=agent_category)

    recommendations = []

    if recent:
        latest = recent[0]
        try:
            dim_stats = json.loads(latest.dimensionStats) if isinstance(latest.dimensionStats, str) else latest.dimensionStats
        except (json.JSONDecodeError, TypeError):
            dim_stats = {}

        # 与基准线对比，找出低于基准的维度
        if isinstance(dim_stats, dict):
            for dim, stats in dim_stats.items():
                if isinstance(stats, dict) and "mean" in stats:
                    dim_mean = stats["mean"]
                    baseline_dim = baseline["dimension_baseline"].get(dim)
                    if baseline_dim and dim_mean < baseline_dim["mean"] - baseline_dim.get("std", 0):
                        recommendations.append({
                            "type": "focus_dimension",
                            "dimension": dim,
                            "current_score": dim_mean,
                            "baseline_score": baseline_dim["mean"],
                            "delta": round(dim_mean - baseline_dim["mean"], 2),
                            "priority": "high" if dim_mean < baseline_dim["mean"] - 1 else "medium",
                            "description": f"维度 {dim} 当前均分 {dim_mean}，低于同类基准 {baseline_dim['mean']}",
                        })

        # 分析常见失败模式
        try:
            fail_dist = json.loads(latest.failureDistribution) if isinstance(latest.failureDistribution, str) else latest.failureDistribution
        except (json.JSONDecodeError, TypeError):
            fail_dist = {}
        if isinstance(fail_dist, dict):
            for cat, ratio in sorted(fail_dist.items(), key=lambda x: x[1], reverse=True)[:3]:
                if ratio > 0.1:
                    recommendations.append({
                        "type": "failure_pattern",
                        "category": cat,
                        "ratio": ratio,
                        "priority": "high" if ratio > 0.3 else "medium",
                        "description": f"失败模式「{cat}」占比 {round(ratio * 100, 1)}%",
                    })

    return {
        "agent_id": agent_id,
        "agent_category": agent_category,
        "baseline": baseline,
        "recommendations": recommendations,
    }


def _analyze_assertion_effectiveness(results) -> List[Dict]:
    """分析断言的区分度"""
    assertion_stats: Dict[str, Dict] = {}

    for r in results:
        try:
            assertion_results = json.loads(r.assertionResults) if isinstance(r.assertionResults, str) else r.assertionResults
        except (json.JSONDecodeError, TypeError):
            assertion_results = None
        if not assertion_results or not isinstance(assertion_results, list):
            continue

        for ar in assertion_results:
            if not isinstance(ar, dict):
                continue
            key = f"{ar.get('type', 'unknown')}:{ar.get('value', '')}"
            if key not in assertion_stats:
                assertion_stats[key] = {"passed_in_passed": 0, "passed_in_failed": 0, "total_passed": 0, "total_failed": 0}

            if r.passed:
                assertion_stats[key]["total_passed"] += 1
                if ar.get("passed"):
                    assertion_stats[key]["passed_in_passed"] += 1
            else:
                assertion_stats[key]["total_failed"] += 1
                if ar.get("passed"):
                    assertion_stats[key]["passed_in_failed"] += 1

    # 计算区分度 = |通过率(passed组) - 通过率(failed组)|
    effective = []
    for key, stats in assertion_stats.items():
        if stats["total_passed"] < 3 or stats["total_failed"] < 3:
            continue
        rate_passed = stats["passed_in_passed"] / stats["total_passed"]
        rate_failed = stats["passed_in_failed"] / stats["total_failed"]
        discrimination = abs(rate_passed - rate_failed)
        if discrimination > 0.3:
            parts = key.split(":", 1)
            effective.append({
                "type": parts[0],
                "value": parts[1] if len(parts) > 1 else "",
                "discrimination": round(discrimination, 3),
                "pass_rate_in_passed": round(rate_passed, 3),
                "pass_rate_in_failed": round(rate_failed, 3),
            })

    return sorted(effective, key=lambda x: x["discrimination"], reverse=True)[:10]


def _format_knowledge(rec) -> Dict[str, Any]:
    """格式化 EvalKnowledge"""
    try:
        fd = json.loads(rec.failureDistribution) if isinstance(rec.failureDistribution, str) else rec.failureDistribution
    except (json.JSONDecodeError, TypeError):
        fd = {}
    try:
        ds = json.loads(rec.dimensionStats) if isinstance(rec.dimensionStats, str) else rec.dimensionStats
    except (json.JSONDecodeError, TypeError):
        ds = {}
    try:
        ea = json.loads(rec.effectiveAssertions) if isinstance(rec.effectiveAssertions, str) else rec.effectiveAssertions
    except (json.JSONDecodeError, TypeError):
        ea = None

    return {
        "id": rec.id,
        "agent_id": rec.agentId,
        "agent_category": rec.agentCategory,
        "eval_run_id": rec.evalRunId,
        "failure_distribution": fd,
        "dimension_stats": ds,
        "effective_assertions": ea,
        "total_cases": rec.totalCases,
        "pass_rate": rec.passRate,
        "overall_score": rec.overallScore,
        "created_at": rec.createdAt.isoformat() if rec.createdAt else None,
    }
