"""回归测试服务：基线对比与退化检测"""
import json
from typing import Dict, List, Any

from app.core.database import prisma


DEGRADATION_THRESHOLDS = {
    "improved": 5.0,      # > 5% 改善
    "stable": -5.0,       # -5% ~ 5% 持平
    "slight_degradation": -10.0,  # -10% ~ -5% 轻微退化
    # < -10% 严重退化
}


def _classify_change(change_pct: float) -> str:
    if change_pct > DEGRADATION_THRESHOLDS["improved"]:
        return "improved"
    if change_pct >= DEGRADATION_THRESHOLDS["stable"]:
        return "stable"
    if change_pct >= DEGRADATION_THRESHOLDS["slight_degradation"]:
        return "slight_degradation"
    return "severe_degradation"


async def compute_regression(baseline_run_id: str, current_run_id: str) -> Dict[str, Any]:
    """计算回归对比报告"""
    baseline_results = await prisma.evalresult.find_many(
        where={"evalRunId": baseline_run_id},
    )
    current_results = await prisma.evalresult.find_many(
        where={"evalRunId": current_run_id},
    )

    # 按 testCaseId 建哈希映射
    baseline_map = {r.testCaseId: r for r in baseline_results}
    current_map = {r.testCaseId: r for r in current_results}

    all_tc_ids = set(baseline_map.keys()) | set(current_map.keys())

    # 维度得分聚合
    baseline_dim_scores: Dict[str, List[float]] = {}
    current_dim_scores: Dict[str, List[float]] = {}

    new_failures = []
    new_passes = []

    for tc_id in all_tc_ids:
        b = baseline_map.get(tc_id)
        c = current_map.get(tc_id)

        if b and c:
            if b.passed and not c.passed:
                new_failures.append(tc_id)
            elif not b.passed and c.passed:
                new_passes.append(tc_id)

        if b:
            scores = b.scores
            if isinstance(scores, str):
                scores = json.loads(scores)
            if isinstance(scores, dict):
                for dim, val in scores.items():
                    if isinstance(val, (int, float)):
                        baseline_dim_scores.setdefault(dim, []).append(float(val))

        if c:
            scores = c.scores
            if isinstance(scores, str):
                scores = json.loads(scores)
            if isinstance(scores, dict):
                for dim, val in scores.items():
                    if isinstance(val, (int, float)):
                        current_dim_scores.setdefault(dim, []).append(float(val))

    # 计算维度变化
    dimension_changes = {}
    all_dims = set(baseline_dim_scores.keys()) | set(current_dim_scores.keys())
    for dim in all_dims:
        b_avg = sum(baseline_dim_scores.get(dim, [0])) / max(len(baseline_dim_scores.get(dim, [1])), 1)
        c_avg = sum(current_dim_scores.get(dim, [0])) / max(len(current_dim_scores.get(dim, [1])), 1)
        change_pct = ((c_avg - b_avg) / b_avg * 100) if b_avg > 0 else 0
        dimension_changes[dim] = {
            "baseline_avg": round(b_avg, 4),
            "current_avg": round(c_avg, 4),
            "change_pct": round(change_pct, 2),
            "level": _classify_change(change_pct),
        }

    # 通过率变化
    b_passed = sum(1 for r in baseline_results if r.passed)
    c_passed = sum(1 for r in current_results if r.passed)
    b_rate = b_passed / max(len(baseline_results), 1) * 100
    c_rate = c_passed / max(len(current_results), 1) * 100

    # 总结
    degraded = [d for d, v in dimension_changes.items() if v["level"] in ("slight_degradation", "severe_degradation")]
    improved = [d for d, v in dimension_changes.items() if v["level"] == "improved"]

    summary_parts = []
    if degraded:
        summary_parts.append(f"退化维度: {', '.join(degraded)}")
    if improved:
        summary_parts.append(f"改善维度: {', '.join(improved)}")
    if new_failures:
        summary_parts.append(f"新增失败: {len(new_failures)} 条")
    if new_passes:
        summary_parts.append(f"新增通过: {len(new_passes)} 条")

    return {
        "baseline_run_id": baseline_run_id,
        "current_run_id": current_run_id,
        "dimension_changes": dimension_changes,
        "pass_rate_change": {
            "baseline": round(b_rate, 2),
            "current": round(c_rate, 2),
            "change_pct": round(c_rate - b_rate, 2),
        },
        "new_failures": new_failures,
        "new_passes": new_passes,
        "summary": "; ".join(summary_parts) if summary_parts else "无显著变化",
    }
