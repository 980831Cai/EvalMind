"""测试套件管理 API"""
import json
import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import prisma
from app.models.pydantic_models import (
    TestSuiteCreate, TestSuiteUpdate, TestSuiteResponse,
    TestCaseItem, TestCaseGenRequest,
)

router = APIRouter(prefix="/test-suites", tags=["TestSuites"])


def _to_response(record) -> TestSuiteResponse:
    test_cases = record.testCases if record.testCases else []
    resp = TestSuiteResponse(
        id=record.id,
        name=record.name,
        description=record.description,
        test_cases=test_cases,
        tags=record.tags if record.tags else None,
        source=record.source,
        generation_config=record.generationConfig if record.generationConfig else None,
        created_at=record.createdAt,
        updated_at=record.updatedAt,
        case_count=len(test_cases) if isinstance(test_cases, list) else 0,
    )
    if hasattr(record, 'version') and record.version:
        resp.version = record.version
    if hasattr(record, 'parentId') and record.parentId:
        resp.parent_id = record.parentId
    if hasattr(record, 'changelog') and record.changelog:
        resp.changelog = record.changelog
    return resp


def _ensure_case_ids(cases: list) -> list:
    for i, case in enumerate(cases):
        if isinstance(case, dict) and not case.get("id"):
            case["id"] = f"tc_{uuid.uuid4().hex[:8]}"
        elif hasattr(case, "id") and not case.id:
            case.id = f"tc_{uuid.uuid4().hex[:8]}"
    return cases


@router.post("", response_model=TestSuiteResponse)
async def create_test_suite(data: TestSuiteCreate):
    cases = [c.model_dump() for c in data.test_cases]
    cases = _ensure_case_ids(cases)

    create_data: dict = {
        "name": data.name,
        "description": data.description or "",
        "testCases": json.dumps(cases),
        "source": data.source,
    }
    if data.tags:
        create_data["tags"] = json.dumps(data.tags)

    record = await prisma.testsuite.create(data=create_data)
    return _to_response(record)


@router.get("", response_model=List[TestSuiteResponse])
async def list_test_suites():
    records = await prisma.testsuite.find_many(order={"createdAt": "desc"})
    return [_to_response(r) for r in records]


@router.get("/{suite_id}", response_model=TestSuiteResponse)
async def get_test_suite(suite_id: str):
    record = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")
    return _to_response(record)


@router.put("/{suite_id}", response_model=TestSuiteResponse)
async def update_test_suite(suite_id: str, data: TestSuiteUpdate):
    record = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.test_cases is not None:
        cases = [c.model_dump() for c in data.test_cases]
        cases = _ensure_case_ids(cases)
        update_data["testCases"] = json.dumps(cases)
    if data.tags is not None:
        update_data["tags"] = json.dumps(data.tags)

    updated = await prisma.testsuite.update(where={"id": suite_id}, data=update_data)
    return _to_response(updated)


@router.delete("/{suite_id}")
async def delete_test_suite(suite_id: str):
    record = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")
    await prisma.testsuite.delete(where={"id": suite_id})
    return {"message": "已删除"}


@router.post("/{suite_id}/cases", response_model=TestSuiteResponse)
async def add_test_case(suite_id: str, case: TestCaseItem):
    record = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    existing = record.testCases if record.testCases else []
    if isinstance(existing, str):
        existing = json.loads(existing)

    new_case = case.model_dump()
    if not new_case.get("id"):
        new_case["id"] = f"tc_{uuid.uuid4().hex[:8]}"
    existing.append(new_case)

    updated = await prisma.testsuite.update(
        where={"id": suite_id},
        data={"testCases": json.dumps(existing)},
    )
    return _to_response(updated)


class ImportTraceRequest(BaseModel):
    """从 Langfuse Trace 导入测试用例"""
    input: str
    expected_output: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.post("/{suite_id}/import-trace", response_model=TestSuiteResponse)
async def import_trace_to_suite(suite_id: str, data: ImportTraceRequest):
    """将 Trace 的输入/输出导入为测试用例"""
    record = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    existing = record.testCases if record.testCases else []
    if isinstance(existing, str):
        existing = json.loads(existing)

    new_case = {
        "id": f"tc_{uuid.uuid4().hex[:8]}",
        "input": data.input,
        "expected_output": data.expected_output,
        "metadata": data.metadata or {"source": "trace"},
    }
    existing.append(new_case)

    updated = await prisma.testsuite.update(
        where={"id": suite_id},
        data={"testCases": json.dumps(existing)},
    )
    return _to_response(updated)


class BatchImportTraceRequest(BaseModel):
    """批量从 Trace 导入测试用例"""
    trace_ids: List[str]
    suite_id: str
    include_expected_output: bool = True
    include_trajectory: bool = False


@router.post("/batch-import-traces")
async def batch_import_traces(data: BatchImportTraceRequest):
    """批量将 Trace 导入为测试用例"""
    record = await prisma.testsuite.find_unique(where={"id": data.suite_id})
    if not record:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    existing = record.testCases if record.testCases else []
    if isinstance(existing, str):
        existing = json.loads(existing)

    imported = 0
    for trace_id in data.trace_ids:
        trace = await prisma.trace.find_unique(where={"id": trace_id})
        if not trace or not trace.inputText:
            continue

        new_case: Dict[str, Any] = {
            "id": f"tc_{uuid.uuid4().hex[:8]}",
            "input": trace.inputText,
            "metadata": {"source": "trace", "trace_id": trace_id},
        }

        if data.include_expected_output and trace.outputText:
            new_case["expected_output"] = trace.outputText

        if data.include_trajectory:
            spans = await prisma.span.find_many(
                where={"traceId": trace_id, "kind": "tool"},
                order={"createdAt": "asc"},
            )
            if spans:
                new_case["expected_trajectory"] = [{
                    "tool_name": s.toolName or s.name,
                    "tool_input": s.toolInput,
                } for s in spans]

        existing.append(new_case)
        imported += 1

    updated = await prisma.testsuite.update(
        where={"id": data.suite_id},
        data={"testCases": json.dumps(existing)},
    )
    return {"imported": imported, "total_cases": len(existing)}


class CreateVersionRequest(BaseModel):
    """创建测试套件新版本"""
    changelog: Optional[str] = None
    test_cases: Optional[List[Dict[str, Any]]] = None  # 新版本的用例，不传则继承


@router.post("/{suite_id}/create-version", response_model=TestSuiteResponse)
async def create_version(suite_id: str, data: CreateVersionRequest):
    """基于现有套件创建新版本"""
    parent = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not parent:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    parent_version = parent.version if hasattr(parent, 'version') and parent.version else 1
    new_version = parent_version + 1

    if data.test_cases:
        cases = data.test_cases
        cases = _ensure_case_ids(cases)
    else:
        cases = parent.testCases if parent.testCases else []
        if isinstance(cases, str):
            cases = json.loads(cases)

    create_data: dict = {
        "name": parent.name,
        "description": parent.description or "",
        "testCases": json.dumps(cases),
        "source": parent.source or "manual",
        "version": new_version,
        "parentId": suite_id,
        "changelog": data.changelog or f"v{new_version} 版本",
    }
    if parent.tags:
        create_data["tags"] = json.dumps(parent.tags) if isinstance(parent.tags, list) else parent.tags

    record = await prisma.testsuite.create(data=create_data)
    return _to_response(record)


@router.get("/{suite_id}/versions", response_model=List[TestSuiteResponse])
async def list_versions(suite_id: str):
    """获取测试套件的所有版本"""
    current = await prisma.testsuite.find_unique(where={"id": suite_id})
    if not current:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    root_id = suite_id
    if hasattr(current, 'parentId') and current.parentId:
        root_id = current.parentId

    versions = await prisma.testsuite.find_many(
        where={"OR": [{"id": root_id}, {"parentId": root_id}]},
        order={"createdAt": "desc"},
    )

    if not versions:
        versions = [current]

    return [_to_response(r) for r in versions]


@router.post("/generate", response_model=TestSuiteResponse)
async def generate_test_cases(data: TestCaseGenRequest):
    from app.services.testcase_generator import generate_test_cases as gen

    system_prompt = data.system_prompt
    skills = data.skills

    if data.agent_id:
        agent = await prisma.agent.find_unique(where={"id": data.agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent 不存在")
        system_prompt = system_prompt or agent.systemPrompt
        if not skills and agent.skills:
            from app.models.pydantic_models import SkillItem
            raw_skills = agent.skills if isinstance(agent.skills, list) else []
            skills = [SkillItem(**s) for s in raw_skills]

    if not system_prompt:
        raise HTTPException(status_code=400, detail="请提供 system_prompt 或选择一个 Agent")

    cases = await gen(
        system_prompt=system_prompt,
        skills=[s.model_dump() for s in skills] if skills else [],
        count=data.count,
        difficulty=data.difficulty,
        model_config_id=data.model_config_id,
    )

    cases = _ensure_case_ids(cases)

    agent_name = ""
    if data.agent_id:
        agent = await prisma.agent.find_unique(where={"id": data.agent_id})
        agent_name = agent.name if agent else ""

    suite_name = f"AI 生成 - {agent_name}" if agent_name else "AI 生成测试套件"

    record = await prisma.testsuite.create(
        data={
            "name": suite_name,
            "description": f"由 LLM 自动生成的测试用例（{data.count} 条，难度: {data.difficulty}）",
            "testCases": json.dumps(cases),
            "source": "generated",
            "generationConfig": json.dumps({
                "agent_id": data.agent_id,
                "system_prompt": system_prompt[:200] if system_prompt else None,
                "skills_count": len(skills) if skills else 0,
                "count": data.count,
                "difficulty": data.difficulty,
            }),
        }
    )
    return _to_response(record)
