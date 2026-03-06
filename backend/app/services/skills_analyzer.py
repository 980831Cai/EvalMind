"""Skills 健康度分析服务"""
import json
import uuid
from typing import Dict, List, Any, Optional
from collections import defaultdict

from app.core.database import prisma
from app.services.judge import judge_with_llm


async def analyze_skills(agent_id: str, model_config_id: Optional[str] = None) -> Dict[str, Any]:
    """分析 Agent 的 Skills 健康度"""
    # 获取该 Agent 的所有评测结果
    eval_runs = await prisma.evalrun.find_many(
        where={"agentId": agent_id, "status": "completed"},
        order={"createdAt": "desc"},
        take=20,
    )
    run_ids = [r.id for r in eval_runs]

    if not run_ids:
        return {"usage_stats": {}, "message": "无评测数据"}

    results = await prisma.evalresult.find_many(
        where={"evalRunId": {"in": run_ids}},
    )

    # 聚合 Skills 调用统计
    usage_stats = _aggregate_usage(results)

    # 获取 Agent 的 Skills 定义
    agent = await prisma.agent.find_unique(where={"id": agent_id})
    skills_def = agent.skills if agent and agent.skills else []
    if isinstance(skills_def, str):
        skills_def = json.loads(skills_def)

    # LLM 评审（可选）
    security_review = None
    design_review = None
    model_config_dict = None

    if model_config_id:
        jc = await prisma.modelconfig.find_unique(where={"id": model_config_id})
        if jc:
            model_config_dict = {
                "base_url": jc.baseUrl,
                "api_key": jc.apiKey,
                "model": jc.modelName,
                "temperature": jc.temperature or 0,
            }

    if model_config_dict and skills_def:
        design_review = await _review_design(skills_def, model_config_dict)
        security_review = await _review_security(skills_def, model_config_dict)

    # 保存分析结果
    analysis_id = str(uuid.uuid4())
    await prisma.skillsanalysis.create(
        data={
            "id": analysis_id,
            "agentId": agent_id,
            "usageStats": json.dumps(usage_stats),
            "securityReview": json.dumps(security_review) if security_review else None,
            "designReview": json.dumps(design_review) if design_review else None,
        }
    )

    return {
        "id": analysis_id,
        "agent_id": agent_id,
        "usage_stats": usage_stats,
        "security_review": security_review,
        "design_review": design_review,
    }


def _aggregate_usage(results) -> Dict[str, Any]:
    """从评测结果聚合 Skills 调用统计"""
    skill_stats = defaultdict(lambda: {
        "count": 0,
        "success_count": 0,
        "latencies": [],
    })

    for r in results:
        skills_called = r.skillsCalled
        if isinstance(skills_called, str):
            skills_called = json.loads(skills_called)
        if not skills_called:
            continue

        trajectory = r.trajectory
        if isinstance(trajectory, str):
            trajectory = json.loads(trajectory)

        # 从 tool_calls 统计
        for tc in (skills_called or []):
            name = tc.get("name", tc.get("tool_name", "unknown"))
            skill_stats[name]["count"] += 1
            # 没有显式 error 字段即算成功
            if not tc.get("error"):
                skill_stats[name]["success_count"] += 1

        # 从 trajectory 提取耗时
        if trajectory:
            for step in trajectory:
                if step.get("step_type") == "tool_result" and step.get("duration_ms"):
                    tool_name = step.get("tool_name", "")
                    if tool_name in skill_stats:
                        skill_stats[tool_name]["latencies"].append(step["duration_ms"])

    # 计算统计指标
    result = {}
    for name, stats in skill_stats.items():
        count = stats["count"]
        success = stats["success_count"]
        latencies = sorted(stats["latencies"])
        p50 = latencies[len(latencies)//2] if latencies else 0

        result[name] = {
            "count": count,
            "success_rate": round(success / max(count, 1) * 100, 2),
            "p50_ms": p50,
            "avg_ms": round(sum(latencies)/len(latencies), 1) if latencies else 0,
            "health": _health_status(success / max(count, 1) * 100, p50),
        }

    return result


def _health_status(success_rate: float, p50_ms: int) -> str:
    if success_rate >= 95 and p50_ms < 5000:
        return "healthy"
    if success_rate >= 80 and p50_ms < 10000:
        return "warning"
    if success_rate >= 50:
        return "degraded"
    return "critical"


async def _review_design(skills_def: List[Dict], judge_config: Dict) -> Dict[str, Any]:
    """LLM 评审 Skills 描述清晰度（利用渐进式披露各层信息）"""
    # 构建包含各层信息的 Skills 摘要
    skills_summary = []
    for s in skills_def:
        info = {"name": s.get("name", ""), "description": s.get("description", "")}
        if s.get("instructions"):
            info["instructions_preview"] = s["instructions"][:300]
        if s.get("allowed_tools"):
            info["allowed_tools"] = s["allowed_tools"]
        children = s.get("children") or []
        if children:
            info["children"] = [{"name": c.get("name", ""), "description": c.get("description", "")} for c in children]
        skills_summary.append(info)

    skills_text = json.dumps(skills_summary, ensure_ascii=False, indent=2)
    prompt = f"""请评估以下 Agent Skills 定义的设计质量（基于渐进式披露规范）。

Skills 定义:
{skills_text}

请从以下方面评估每个 Skill:
1. 描述清晰度 (1-10): 名称和描述是否清晰准确，能否帮助 AI 正确发现和匹配
2. 功能边界 (1-10): 职责是否明确、无重叠
3. 指令质量 (1-10): instructions 是否提供了清晰的步骤指导
4. 层级结构 (1-10): 分组和子技能组织是否合理
5. 改进建议: 具体的优化建议

请严格按 JSON 输出:
{{"skills": [{{"name": "skill_name", "clarity_score": 8, "boundary_score": 7, "instruction_score": 8, "hierarchy_score": 7, "suggestions": ["建议1"]}}], "overall": "总体评价"}}
"""
    result = await judge_with_llm(prompt, judge_config=judge_config)
    return result


async def _review_security(skills_def: List[Dict], judge_config: Dict) -> Dict[str, Any]:
    """LLM 评审 Skills 安全性（包含 allowed_tools 和脚本分析）"""
    # 包含工具和脚本信息
    skills_security_info = []
    for s in skills_def:
        info = {"name": s.get("name", ""), "description": s.get("description", "")}
        if s.get("allowed_tools"):
            info["allowed_tools"] = s["allowed_tools"]
        if s.get("scripts"):
            info["scripts"] = [{"name": sc.get("name", ""), "language": sc.get("language", "")} for sc in s["scripts"]]
        skills_security_info.append(info)

    skills_text = json.dumps(skills_security_info, ensure_ascii=False, indent=2)
    prompt = f"""请从安全角度评估以下 Agent Skills:

Skills 定义:
{skills_text}

评估要点:
1. 是否有潜在的注入风险
2. 是否有未授权操作风险
3. 数据安全是否有保障
4. 是否需要权限控制
5. allowed_tools 授权范围是否合理
6. 脚本执行是否存在安全隐患

请严格按 JSON 输出:
{{"risks": [{{"skill": "name", "level": "low/medium/high", "description": "风险描述"}}], "overall_risk": "low/medium/high", "recommendations": ["建议"]}}
"""
    result = await judge_with_llm(prompt, judge_config=judge_config)
    return result
