"""评测经验库 API - 基准线查询、智能推荐"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.services.eval_knowledge_service import get_baseline, get_recommendations, AGENT_CATEGORIES

router = APIRouter(prefix="/eval-knowledge", tags=["eval-knowledge"])


@router.get("/categories")
async def list_categories():
    """获取 Agent 业务类型列表"""
    return {
        "categories": [
            {"value": "customer_service", "label_zh": "客服", "label_en": "Customer Service"},
            {"value": "coding", "label_zh": "编码", "label_en": "Coding"},
            {"value": "search", "label_zh": "搜索", "label_en": "Search"},
            {"value": "writing", "label_zh": "写作", "label_en": "Writing"},
            {"value": "data_analysis", "label_zh": "数据分析", "label_en": "Data Analysis"},
            {"value": "general", "label_zh": "通用", "label_en": "General"},
        ]
    }


@router.get("/baseline")
async def get_baseline_api(
    agent_category: str = Query("general"),
    agent_id: Optional[str] = Query(None),
):
    """获取评测基准线"""
    return await get_baseline(agent_category=agent_category, agent_id=agent_id)


@router.get("/recommendations/{agent_id}")
async def get_recommendations_api(agent_id: str):
    """获取 Agent 的智能推荐"""
    result = await get_recommendations(agent_id)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result
