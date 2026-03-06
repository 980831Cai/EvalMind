"""改进报告 API - 生成评测改进报告"""
from fastapi import APIRouter, HTTPException, Query

from app.services.improvement_report import generate_report

router = APIRouter(prefix="/improvement-report", tags=["improvement-report"])


@router.get("/{eval_run_id}")
async def get_improvement_report(
    eval_run_id: str,
    lang: str = Query("zh", pattern="^(zh|en)$"),
):
    """生成评测改进报告"""
    try:
        report = await generate_report(eval_run_id, lang=lang)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")
