"""Bad Case 管理服务"""
import json
import uuid
from typing import Dict, List, Any, Optional

from prisma import Json as PrismaJson
from app.core.database import prisma


def _wrap_json(value: Any) -> Any:
    """将值包装为 Prisma Json 类型（用于 @db.Json 字段）"""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
    return PrismaJson(value)


async def create_bad_case(
    agent_id: str,
    input_text: str,
    expected_output: Optional[str] = None,
    actual_output: Optional[str] = None,
    assertions: Optional[List[Dict]] = None,
    source: str = "manual",
    eval_result_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    root_cause: Optional[str] = None,
) -> Dict[str, Any]:
    """创建 Bad Case"""
    data: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "agentId": agent_id,
        "input": input_text,
        "expectedOutput": expected_output,
        "actualOutput": actual_output,
        "source": source,
        "status": "open",
        "rootCause": root_cause,
    }
    if eval_result_id:
        data["evalResultId"] = eval_result_id
    if assertions is not None:
        data["assertions"] = _wrap_json(assertions)
    if tags is not None:
        data["tags"] = _wrap_json(tags)
    record = await prisma.badcase.create(data=data)
    return _to_dict(record)


async def import_from_eval_result(eval_result_id: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """从评测结果导入 Bad Case"""
    result = await prisma.evalresult.find_unique(
        where={"id": eval_result_id},
        include={"evalRun": True},
    )
    if not result:
        raise ValueError("评测结果不存在")

    return await create_bad_case(
        agent_id=result.evalRun.agentId,
        input_text=result.input,
        expected_output=result.expectedOutput,
        actual_output=result.agentOutput,
        source="eval_result",
        eval_result_id=eval_result_id,
        tags=tags,
    )


async def export_to_test_suite(
    bad_case_ids: List[str],
    test_suite_id: str,
) -> int:
    """批量导出 Bad Case 到测试套件"""
    bad_cases = await prisma.badcase.find_many(
        where={"id": {"in": bad_case_ids}}
    )
    if not bad_cases:
        return 0

    suite = await prisma.testsuite.find_unique(where={"id": test_suite_id})
    if not suite:
        raise ValueError("测试套件不存在")

    existing_cases = suite.testCases or []
    if isinstance(existing_cases, str):
        existing_cases = json.loads(existing_cases)

    new_cases = []
    for bc in bad_cases:
        assertions = bc.assertions
        if isinstance(assertions, str):
            assertions = json.loads(assertions)

        new_cases.append({
            "id": f"bc_{bc.id[:8]}",
            "input": bc.input,
            "expected_output": bc.expectedOutput or "",
            "metadata": {"source": "bad_case", "bad_case_id": bc.id},
            "assertions": assertions,
        })

    all_cases = existing_cases + new_cases
    await prisma.testsuite.update(
        where={"id": test_suite_id},
        data={"testCases": PrismaJson(all_cases)},
    )

    # 更新 Bad Case 状态
    await prisma.badcase.update_many(
        where={"id": {"in": bad_case_ids}},
        data={"status": "exported"},
    )

    return len(new_cases)


def _to_dict(record) -> Dict[str, Any]:
    tags = record.tags
    if isinstance(tags, str):
        tags = json.loads(tags)
    assertions = record.assertions
    if isinstance(assertions, str):
        assertions = json.loads(assertions)

    return {
        "id": record.id,
        "agent_id": record.agentId,
        "input": record.input,
        "expected_output": record.expectedOutput,
        "actual_output": record.actualOutput,
        "assertions": assertions,
        "source": record.source,
        "eval_result_id": record.evalResultId,
        "status": record.status,
        "tags": tags,
        "root_cause": record.rootCause,
        "created_at": record.createdAt.isoformat(),
        "updated_at": record.updatedAt.isoformat(),
    }
