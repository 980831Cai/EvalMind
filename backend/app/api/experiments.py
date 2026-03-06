"""实验系统 API — Phase 3.1
支持多变量组合实验（Prompt版本/模型/温度/工具配置）
"""
import json
import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("experiments")

router = APIRouter(prefix="/experiments", tags=["Experiments"])


# ===== Pydantic Models =====
class ExperimentVariable(BaseModel):
    type: str  # model, prompt, temperature, tool_config, strategy
    values: list  # 每个变量的候选值列表


class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    agent_id: str
    test_suite_id: str
    variables: List[ExperimentVariable]
    dimensions: Optional[List[str]] = ["accuracy", "completeness", "helpfulness"]
    model_config_id: Optional[str] = None


class ExperimentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    agent_id: str
    test_suite_id: str
    variables: list
    eval_run_ids: list
    result_matrix: Optional[dict] = None
    dimensions: Optional[list] = None
    model_config_id: Optional[str] = None
    status: str
    total_combinations: int
    completed_combinations: int
    created_at: str
    updated_at: str


def _to_response(record) -> dict:
    return {
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "agent_id": record.agentId,
        "test_suite_id": record.testSuiteId,
        "variables": record.variables if record.variables else [],
        "eval_run_ids": record.evalRunIds if record.evalRunIds else [],
        "result_matrix": record.resultMatrix if record.resultMatrix else None,
        "dimensions": record.dimensions if record.dimensions else None,
        "model_config_id": record.modelConfigId,
        "status": record.status,
        "total_combinations": record.totalCombinations,
        "completed_combinations": record.completedCombinations,
        "created_at": record.createdAt.isoformat(),
        "updated_at": record.updatedAt.isoformat(),
    }


def _cartesian_product(variables: List[ExperimentVariable]) -> list:
    """计算变量的笛卡尔积，返回所有组合"""
    if not variables:
        return [{}]
    combinations = [{}]
    for var in variables:
        new_combos = []
        for combo in combinations:
            for val in var.values:
                new_combo = {**combo, var.type: val}
                new_combos.append(new_combo)
        combinations = new_combos
    return combinations


@router.post("", response_model=None)
async def create_experiment(data: ExperimentCreate, background_tasks: BackgroundTasks):
    """创建实验 — 自动计算笛卡尔积并启动批量评测"""
    agent = await prisma.agent.find_unique(where={"id": data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    suite = await prisma.testsuite.find_unique(where={"id": data.test_suite_id})
    if not suite:
        raise HTTPException(status_code=404, detail="测试套件不存在")

    combinations = _cartesian_product(data.variables)

    experiment = await prisma.experiment.create(data={
        "name": data.name,
        "description": data.description or "",
        "agentId": data.agent_id,
        "testSuiteId": data.test_suite_id,
        "variables": json.dumps([v.model_dump() for v in data.variables]),
        "evalRunIds": json.dumps([]),
        "dimensions": json.dumps(data.dimensions or []),
        "modelConfigId": data.model_config_id,
        "status": "pending",
        "totalCombinations": len(combinations),
        "completedCombinations": 0,
    })

    background_tasks.add_task(_run_experiment, experiment.id, combinations, data)
    return _to_response(experiment)


async def _run_experiment(experiment_id: str, combinations: list, data: ExperimentCreate):
    """后台执行实验 — 为每个组合创建一个 EvalRun"""
    from app.services.eval_engine import run_eval

    try:
        await prisma.experiment.update(
            where={"id": experiment_id},
            data={"status": "running"},
        )

        run_ids = []
        for i, combo in enumerate(combinations):
            label_parts = []
            model_override = None
            applied_strategies = []
            strategy_prompt_patches = []
            for var_type, val in combo.items():
                label_parts.append(f"{var_type}={val}")
                if var_type == "model":
                    model_override = str(val)
                elif var_type == "strategy":
                    # val 是 Gene ID，需要加载策略的 prompt_patch
                    applied_strategies.append(str(val))

            # 加载策略的 prompt_patch
            if applied_strategies:
                from app.services.gene_service import get_gene, increment_usage
                for gene_id in applied_strategies:
                    gene = await get_gene(gene_id)
                    if gene and gene.get("prompt_patch"):
                        strategy_prompt_patches.append(gene["prompt_patch"])
                        await increment_usage(gene_id)

            agent = await prisma.agent.find_unique(where={"id": data.agent_id})
            suite = await prisma.testsuite.find_unique(where={"id": data.test_suite_id})

            test_cases = suite.testCases if suite.testCases else []
            if isinstance(test_cases, str):
                test_cases = json.loads(test_cases)

            # 构建 system_prompt：原始 + 策略补丁
            system_prompt = agent.systemPrompt or ""
            if strategy_prompt_patches:
                system_prompt = system_prompt + "\n\n" + "\n\n".join(strategy_prompt_patches)

            run = await prisma.evalrun.create(data={
                "agentId": data.agent_id,
                "testSuiteId": data.test_suite_id,
                "modelConfigId": data.model_config_id,
                "agentSnapshot": json.dumps({
                    "name": agent.name,
                    "agent_type": agent.agentType,
                    "agent_config": agent.agentConfig if isinstance(agent.agentConfig, dict) else json.loads(agent.agentConfig) if agent.agentConfig else {},
                    "system_prompt": system_prompt,
                    "skills": agent.skills if isinstance(agent.skills, list) else json.loads(agent.skills) if agent.skills else [],
                    "experiment_combo": combo,
                    "applied_strategies": applied_strategies,
                }),
                "testSuiteSnapshot": json.dumps({
                    "name": suite.name,
                    "test_cases": test_cases,
                }),
                "dimensions": json.dumps(data.dimensions or []),
                "modelOverride": model_override,
                "status": "pending",
                "totalItems": len(test_cases) if isinstance(test_cases, list) else 0,
            })

            run_ids.append(run.id)

            await prisma.experiment.update(
                where={"id": experiment_id},
                data={"evalRunIds": json.dumps(run_ids)},
            )

        for run_id in run_ids:
            try:
                await run_eval(run_id)
            except Exception as e:
                logger.error("experiment_run_failed", run_id=run_id, experiment_id=experiment_id, error=str(e))

            completed = await prisma.experiment.find_unique(where={"id": experiment_id})
            if completed:
                await prisma.experiment.update(
                    where={"id": experiment_id},
                    data={"completedCombinations": (completed.completedCombinations or 0) + 1},
                )

        await _build_result_matrix(experiment_id)

        await prisma.experiment.update(
            where={"id": experiment_id},
            data={"status": "completed"},
        )

    except Exception as e:
        logger.error("experiment_failed", experiment_id=experiment_id, error=str(e))
        await prisma.experiment.update(
            where={"id": experiment_id},
            data={"status": "failed"},
        )


async def _build_result_matrix(experiment_id: str):
    """构建实验结果矩阵"""
    experiment = await prisma.experiment.find_unique(where={"id": experiment_id})
    if not experiment:
        return

    run_ids = experiment.evalRunIds or []
    if isinstance(run_ids, str):
        run_ids = json.loads(run_ids)

    variables = experiment.variables or []
    if isinstance(variables, str):
        variables = json.loads(variables)

    combinations = _cartesian_product(
        [ExperimentVariable(**v) for v in variables]
    )

    matrix_rows = []
    for i, combo in enumerate(combinations):
        run_id = run_ids[i] if i < len(run_ids) else None
        row = {"combination": combo, "run_id": run_id}

        if run_id:
            run = await prisma.evalrun.find_unique(where={"id": run_id})
            if run:
                row["status"] = run.status
                row["average_score"] = run.averageScore
                row["passed_count"] = run.passedCount
                row["failed_count"] = run.failedCount
                row["total_items"] = run.totalItems
                pass_rate = 0
                if run.totalItems and run.totalItems > 0:
                    pass_rate = round((run.passedCount or 0) / run.totalItems * 100, 1)
                row["pass_rate"] = pass_rate

        matrix_rows.append(row)

    result_matrix = {
        "combinations": matrix_rows,
        "total": len(combinations),
        "variables": variables,
    }

    await prisma.experiment.update(
        where={"id": experiment_id},
        data={"resultMatrix": json.dumps(result_matrix)},
    )


@router.get("", response_model=None)
async def list_experiments():
    records = await prisma.experiment.find_many(order={"createdAt": "desc"})
    return [_to_response(r) for r in records]


@router.get("/{experiment_id}", response_model=None)
async def get_experiment(experiment_id: str):
    record = await prisma.experiment.find_unique(where={"id": experiment_id})
    if not record:
        raise HTTPException(status_code=404, detail="实验不存在")
    if record.status in ("running", "completed"):
        await _build_result_matrix(experiment_id)
        record = await prisma.experiment.find_unique(where={"id": experiment_id})
    return _to_response(record)


@router.delete("/{experiment_id}")
async def delete_experiment(experiment_id: str):
    record = await prisma.experiment.find_unique(where={"id": experiment_id})
    if not record:
        raise HTTPException(status_code=404, detail="实验不存在")
    await prisma.experiment.delete(where={"id": experiment_id})
    return {"message": "已删除"}
