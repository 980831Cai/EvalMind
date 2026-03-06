"""Bad Case 到策略沉淀服务 - 从 Bad Case 自动提炼改进策略"""
import json
import logging
from typing import Optional, List, Dict, Any

from app.core.database import get_db
from app.services.gene_service import create_gene

logger = logging.getLogger("bad_case_to_gene")

# 失败类型到 Gene 策略描述的映射模板
FAILURE_TO_STRATEGY = {
    "hallucination": {
        "name_template": "防幻觉策略",
        "prompt_template": (
            "严格要求：\n"
            "1. 只基于已知事实和提供的上下文回答问题\n"
            "2. 当不确定某个信息时，明确表示'我不确定'或'根据现有信息无法确认'\n"
            "3. 严禁编造不存在的 API、函数名、URL、数据或事实\n"
            "4. 引用信息时标明来源"
        ),
    },
    "tool_selection_error": {
        "name_template": "工具选择优化策略",
        "prompt_template": (
            "工具使用规范：\n"
            "1. 仔细分析用户需求后再选择合适的工具\n"
            "2. 优先使用与任务最直接相关的工具\n"
            "3. 如果不确定使用哪个工具，先分析可选工具的功能描述再决定\n"
            "4. 避免使用与任务无关的工具"
        ),
    },
    "reasoning_error": {
        "name_template": "推理链强化策略",
        "prompt_template": (
            "推理要求：\n"
            "1. 回答前先进行逐步推理，确保每一步逻辑正确\n"
            "2. 复杂问题需要分解为子问题逐一解决\n"
            "3. 在给出结论前检查推理过程是否有逻辑跳跃或矛盾\n"
            "4. 如果推理过程中发现矛盾，重新审视并修正"
        ),
    },
    "incomplete_response": {
        "name_template": "回答完整性策略",
        "prompt_template": (
            "完整性要求：\n"
            "1. 回答需覆盖用户问题的所有方面\n"
            "2. 多步骤任务需要列出所有步骤\n"
            "3. 回答结束前检查是否遗漏了重要信息\n"
            "4. 如果问题涉及多个方面，确保每个方面都有回应"
        ),
    },
    "tool_execution_error": {
        "name_template": "工具执行容错策略",
        "prompt_template": (
            "工具执行规范：\n"
            "1. 工具调用前验证参数的格式和有效性\n"
            "2. 工具调用失败时，分析错误原因并尝试修正参数后重试\n"
            "3. 如果工具持续失败，尝试使用替代方案完成任务\n"
            "4. 向用户说明工具调用的结果和任何异常情况"
        ),
    },
    "safety_violation": {
        "name_template": "安全合规策略",
        "prompt_template": (
            "安全规范：\n"
            "1. 严禁生成有害、违法或不道德的内容\n"
            "2. 拒绝执行可能造成安全风险的操作\n"
            "3. 保护用户隐私数据，不泄露敏感信息\n"
            "4. 当检测到潜在风险时，主动告知用户并给出安全建议"
        ),
    },
    "format_error": {
        "name_template": "输出格式规范策略",
        "prompt_template": (
            "格式要求：\n"
            "1. 严格按照要求的格式输出结果\n"
            "2. 代码块使用正确的语言标注\n"
            "3. JSON 输出需确保格式有效且可解析\n"
            "4. 结构化数据按指定的字段名和类型输出"
        ),
    },
    "context_misunderstanding": {
        "name_template": "上下文理解策略",
        "prompt_template": (
            "上下文理解要求：\n"
            "1. 仔细阅读并理解完整的上下文信息后再回答\n"
            "2. 注意上下文中的限定条件和约束\n"
            "3. 多轮对话中保持上下文连贯性\n"
            "4. 当上下文信息不足时，主动询问澄清"
        ),
    },
    "other": {
        "name_template": "通用改进策略",
        "prompt_template": (
            "通用改进：\n"
            "1. 确保回答准确、完整、有帮助\n"
            "2. 回答前仔细分析用户的真实意图\n"
            "3. 结构化组织回答内容，便于用户理解\n"
            "4. 如有不确定之处，坦诚告知用户"
        ),
    },
}


async def distill_gene_from_bad_case(bad_case_id: str, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """从单个 Bad Case 提炼策略基因"""
    db = get_db()
    bad_case = await db.badcase.find_unique(where={"id": bad_case_id})
    if not bad_case:
        raise ValueError(f"Bad Case not found: {bad_case_id}")

    # 解析 failure_analysis（如果存在于关联的 EvalResult 中）
    failure_category = "other"
    suggested_fix = ""

    if bad_case.rootCause:
        # 尝试从 rootCause 中提取失败类型
        root_cause_lower = bad_case.rootCause.lower()
        for cat in FAILURE_TO_STRATEGY:
            if cat in root_cause_lower:
                failure_category = cat
                break
        suggested_fix = bad_case.rootCause

    # 获取策略模板
    strategy = FAILURE_TO_STRATEGY.get(failure_category, FAILURE_TO_STRATEGY["other"])

    # 构建 Gene 数据
    gene_data = {
        "name": overrides.get("name") if overrides and overrides.get("name") else f"{strategy['name_template']} (来自 Bad Case)",
        "description": overrides.get("description") if overrides and overrides.get("description") else f"从 Bad Case 自动提炼。根因: {suggested_fix or '未分析'}",
        "category": overrides.get("category") if overrides and overrides.get("category") else "repair",
        "signals_match": overrides.get("signals_match") if overrides and overrides.get("signals_match") else [failure_category],
        "prompt_patch": overrides.get("prompt_patch") if overrides and overrides.get("prompt_patch") else strategy["prompt_template"],
        "source": "bad_case",
        "source_id": bad_case_id,
        "agent_id": bad_case.agentId,
        "tags": overrides.get("tags") if overrides else None,
    }

    gene = await create_gene(gene_data)

    # 更新 Bad Case 状态为 resolved
    await db.badcase.update(
        where={"id": bad_case_id},
        data={"status": "resolved"},
    )
    logger.info(f"Bad Case {bad_case_id} distilled to Gene {gene['id']}, status -> resolved")

    return gene


async def batch_distill_genes(bad_case_ids: List[str], merge_similar: bool = True) -> Dict[str, Any]:
    """批量从 Bad Case 提炼策略基因"""
    db = get_db()
    results = {"created": [], "errors": [], "merged": 0}

    if not merge_similar:
        for bc_id in bad_case_ids:
            try:
                gene = await distill_gene_from_bad_case(bc_id)
                results["created"].append(gene)
            except Exception as e:
                results["errors"].append({"bad_case_id": bc_id, "error": str(e)})
        return results

    # 合并相似 Bad Case：按失败类型分组
    grouped: Dict[str, List[str]] = {}
    for bc_id in bad_case_ids:
        bad_case = await db.badcase.find_unique(where={"id": bc_id})
        if not bad_case:
            results["errors"].append({"bad_case_id": bc_id, "error": "Not found"})
            continue

        failure_category = "other"
        if bad_case.rootCause:
            root_cause_lower = bad_case.rootCause.lower()
            for cat in FAILURE_TO_STRATEGY:
                if cat in root_cause_lower:
                    failure_category = cat
                    break

        key = f"{bad_case.agentId or 'general'}_{failure_category}"
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(bc_id)

    # 每组创建一个合并的 Gene
    for key, bc_ids in grouped.items():
        agent_id_part, failure_cat = key.rsplit("_", 1)
        agent_id = agent_id_part if agent_id_part != "general" else None

        strategy = FAILURE_TO_STRATEGY.get(failure_cat, FAILURE_TO_STRATEGY["other"])

        gene_data = {
            "name": f"{strategy['name_template']} (合并 {len(bc_ids)} 个 Bad Case)",
            "description": f"从 {len(bc_ids)} 个同类 Bad Case 合并提炼",
            "category": "repair",
            "signals_match": [failure_cat],
            "prompt_patch": strategy["prompt_template"],
            "source": "bad_case",
            "source_id": bc_ids[0],
            "agent_id": agent_id,
        }

        try:
            gene = await create_gene(gene_data)
            results["created"].append(gene)
            results["merged"] += len(bc_ids) - 1

            # 更新所有相关 Bad Case 状态
            for bc_id in bc_ids:
                await db.badcase.update(where={"id": bc_id}, data={"status": "resolved"})
        except Exception as e:
            results["errors"].append({"bad_case_ids": bc_ids, "error": str(e)})

    return results
