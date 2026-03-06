"""Pydantic 请求/响应模型 — v3.0 评估框架升级"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# ===== Model Config =====
class ModelConfigCreate(BaseModel):
    name: str
    provider: str  # openai, deepseek, anthropic, ollama
    model_name: str
    base_url: str
    api_key: str
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 2048
    top_p: Optional[float] = 1.0
    config: Optional[Dict[str, Any]] = None


class ModelConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ModelConfigResponse(BaseModel):
    id: str
    name: str
    provider: str
    model_name: str
    base_url: str
    api_key: str = ""  # 返回时脱敏
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 2048
    top_p: Optional[float] = 1.0
    config: Optional[Dict[str, Any]] = None
    is_active: bool = True
    last_tested_at: Optional[datetime] = None
    test_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ===== Skill =====
class SkillScript(BaseModel):
    """Skill 可执行脚本（Layer 3 资源）"""
    name: str
    content: str = ""
    language: str = "python"  # python, bash, javascript


class SkillItem(BaseModel):
    """渐进式披露 Skill 模型
    Layer 1: name + description（始终加载，用于 AI 发现匹配）
    Layer 2: instructions（按需加载，详细指令和步骤）
    Layer 3: references, examples, scripts（执行时按需加载）
    """
    name: str
    description: str = ""
    # Layer 2: 核心指令
    instructions: Optional[str] = None  # SKILL.md 正文内容（Markdown）
    # Layer 3: 资源文件
    references: Optional[str] = None    # 详细 API 文档 / 参考资料
    examples: Optional[str] = None      # 使用示例
    scripts: Optional[List[SkillScript]] = None  # 可执行脚本
    # 元数据
    allowed_tools: Optional[List[str]] = None  # 预批准的工具列表
    metadata: Optional[Dict[str, Any]] = None
    # 层级分组
    children: Optional[List["SkillItem"]] = None

# 支持递归自引用
SkillItem.model_rebuild()


# ===== Trajectory Step =====
class TrajectoryStepSchema(BaseModel):
    step_index: int
    step_type: str  # "thinking" | "tool_call" | "tool_result" | "text_output"
    content: str = ""
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result: Optional[str] = None
    timestamp_ms: int = 0
    duration_ms: int = 0


# ===== Agent =====
class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: Optional[str] = None
    skills: Optional[List[SkillItem]] = None
    mcp_config: Optional[Dict[str, Any]] = None
    agent_type: str = "http"  # http / openai / knot
    agent_config: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    skills: Optional[List[SkillItem]] = None
    mcp_config: Optional[Dict[str, Any]] = None
    agent_type: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class AgentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    system_prompt: Optional[str] = None
    skills: Optional[List[Dict[str, Any]]] = None
    mcp_config: Optional[Dict[str, Any]] = None
    agent_type: str = "http"
    agent_config: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# ===== Assertion =====
class AssertionItem(BaseModel):
    type: str  # contains, not_contains, regex_match, exact_match, ...
    value: Optional[Any] = None
    critical: bool = False


class AssertionResultItem(BaseModel):
    type: str
    value: Optional[Any] = None
    passed: bool = False
    reason: str = ""
    critical: bool = False


# ===== Test Case =====
class SubGoal(BaseModel):
    """子目标定义，用于步骤级评估"""
    id: str
    description: str
    check_type: str  # contains, tool_called, llm_judge, regex_match
    check_value: Optional[Any] = None
    weight: float = 1.0


class TestCaseItem(BaseModel):
    id: str = ""
    input: str
    expected_output: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    assertions: Optional[List[AssertionItem]] = None
    sub_goals: Optional[List[SubGoal]] = None
    expected_trajectory: Optional[List[Dict]] = None


# ===== Test Suite =====
class TestSuiteCreate(BaseModel):
    name: str
    description: str = ""
    test_cases: List[TestCaseItem] = []
    tags: Optional[List[str]] = None
    source: str = "manual"  # manual / generated


class TestSuiteUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    test_cases: Optional[List[TestCaseItem]] = None
    tags: Optional[List[str]] = None


class TestSuiteResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    test_cases: List[Dict[str, Any]] = []
    tags: Optional[List[str]] = None
    source: Optional[str] = "manual"
    generation_config: Optional[Dict[str, Any]] = None
    version: int = 1
    parent_id: Optional[str] = None
    changelog: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    case_count: int = 0


# ===== Test Case Generation =====
class TestCaseGenRequest(BaseModel):
    system_prompt: Optional[str] = None
    skills: Optional[List[SkillItem]] = None
    agent_id: Optional[str] = None  # 可选，直接从 Agent 读取
    model_config_id: Optional[str] = None  # 可选，指定使用哪个 Model LLM
    count: int = Field(default=10, ge=1, le=50)
    difficulty: str = "mixed"  # easy / medium / hard / mixed


# ===== Eval Run =====
class EvalRunCreate(BaseModel):
    agent_id: str
    test_suite_id: str
    model_config_id: Optional[str] = None
    dimensions: List[str] = ["accuracy", "completeness", "helpfulness"]
    enable_skills_eval: bool = False
    enable_trajectory_eval: bool = False
    trajectory_dimensions: List[str] = []
    concurrency: int = 5
    timeout: int = 60
    template_id: Optional[str] = None
    model_override: Optional[str] = None
    is_baseline: bool = False
    repeat_count: int = 1


class EvalRunResponse(BaseModel):
    id: str
    agent_id: str
    test_suite_id: str
    model_config_id: Optional[str] = None
    agent_snapshot: Dict[str, Any] = {}
    test_suite_snapshot: Dict[str, Any] = {}
    dimensions: List[str] = []
    enable_skills_eval: bool = False
    enable_trajectory_eval: bool = False
    trajectory_dimensions: List[str] = []
    concurrency: Optional[int] = 5
    timeout: Optional[int] = 60
    template_id: Optional[str] = None
    model_override: Optional[str] = None
    is_baseline: bool = False
    baseline_run_id: Optional[str] = None
    repeat_count: int = 1
    pass_at_k: Optional[Dict[str, Any]] = None
    status: str = "pending"
    progress: int = 0
    current_item: int = 0
    total_items: int = 0
    passed_count: Optional[int] = 0
    failed_count: Optional[int] = 0
    average_score: Optional[float] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    # 嵌套
    agent_name: str = ""
    test_suite_name: str = ""
    model_config_name: str = ""
    results: Optional[List["EvalResultResponse"]] = None


# ===== Eval Result =====
class EvalResultResponse(BaseModel):
    id: str
    eval_run_id: str
    test_case_id: str
    input: str
    expected_output: Optional[str] = None
    agent_output: Optional[str] = None
    agent_thinking: Optional[str] = None
    skills_called: Optional[List[Dict[str, Any]]] = None
    trajectory: Optional[List[Dict[str, Any]]] = None
    trajectory_scores: Optional[Dict[str, Any]] = None
    trajectory_overall: Optional[float] = None
    trajectory_reasoning: Optional[str] = None
    scores: Dict[str, Any] = {}
    overall_score: float = 0.0
    passed: bool = False
    assertion_results: Optional[List[AssertionResultItem]] = None
    critical_failure: Optional[bool] = False
    reasoning: Optional[str] = None
    latency_ms: Optional[int] = None
    token_usage: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    progress_rate: Optional[float] = None
    sub_goal_results: Optional[List[Dict[str, Any]]] = None
    grounding_accuracy: Optional[float] = None
    tool_eval_results: Optional[Dict[str, Any]] = None
    failure_analysis: Optional[Dict[str, Any]] = None
    cost_data: Optional[Dict[str, Any]] = None
    created_at: datetime


# ===== Dashboard =====
class DashboardStats(BaseModel):
    total_agents: int = 0
    total_test_suites: int = 0
    total_eval_runs: int = 0
    total_eval_results: int = 0
    avg_score: Optional[float] = None
    avg_latency: Optional[float] = None
    recent_runs: List[EvalRunResponse] = []


# ===== Eval Template =====
class EvalTemplateCreate(BaseModel):
    name: str
    category: str  # generic, customer_service, coding, rag
    description: Optional[str] = None
    dimension_config: List[Dict[str, Any]] = []  # [{dimensionId, weight, enabled}]


class EvalTemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    dimension_config: Optional[List[Dict[str, Any]]] = None


class EvalTemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    description: Optional[str] = None
    is_builtin: bool = False
    dimension_config: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime


# ===== Eval Dimension =====
class EvalDimensionResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: str
    layer: str
    scoring_method: str
    scoring_criteria: Optional[str] = None
    evaluation_steps: Optional[str] = None
    weight: float = 1.0
    requires_reference: bool = True


# ===== Bad Case =====
class BadCaseCreate(BaseModel):
    agent_id: str
    input: str
    expected_output: Optional[str] = None
    actual_output: Optional[str] = None
    assertions: Optional[List[AssertionItem]] = None
    source: str = "manual"
    eval_result_id: Optional[str] = None
    tags: Optional[List[str]] = None
    root_cause: Optional[str] = None


class BadCaseUpdate(BaseModel):
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    root_cause: Optional[str] = None
    assertions: Optional[List[AssertionItem]] = None


class BadCaseResponse(BaseModel):
    id: str
    agent_id: str
    input: str
    expected_output: Optional[str] = None
    actual_output: Optional[str] = None
    assertions: Optional[List[Dict[str, Any]]] = None
    source: str
    eval_result_id: Optional[str] = None
    status: str = "open"
    tags: Optional[List[str]] = None
    root_cause: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ===== Comparison Run =====
class ComparisonRunCreate(BaseModel):
    name: str
    mode: str = "quick"  # quick, free
    test_suite_id: str
    template_id: Optional[str] = None
    agent_id: Optional[str] = None  # quick mode: 单个agent
    agent_ids: Optional[List[str]] = None  # free mode: 多个agent
    model_overrides: Optional[List[str]] = None  # quick mode: 多个模型名
    repeat_count: int = 1
    dimensions: List[str] = ["accuracy", "completeness", "helpfulness"]
    model_config_id: Optional[str] = None


class ComparisonRunResponse(BaseModel):
    id: str
    name: str
    mode: str
    test_suite_id: str
    template_id: Optional[str] = None
    eval_run_ids: List[str] = []
    model_labels: List[str] = []
    repeat_count: int = 1
    comparison_data: Optional[Dict[str, Any]] = None
    status: str = "pending"
    created_at: datetime
    updated_at: datetime


# ===== Skills Analysis =====
class SkillsAnalysisResponse(BaseModel):
    id: str
    agent_id: str
    usage_stats: Dict[str, Any] = {}
    security_review: Optional[Dict[str, Any]] = None
    design_review: Optional[Dict[str, Any]] = None
    created_at: datetime


# ===== Regression =====
class RegressionReport(BaseModel):
    baseline_run_id: str
    current_run_id: str
    dimension_changes: Dict[str, Any] = {}  # {dim: {baseline, current, change_pct, level}}
    pass_rate_change: Optional[Dict[str, Any]] = None
    new_failures: List[str] = []
    new_passes: List[str] = []
    summary: str = ""
