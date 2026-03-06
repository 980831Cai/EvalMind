// ===== Model Config =====
export interface ModelConfig {
  id: string
  name: string
  provider: string
  model_name: string
  base_url: string
  api_key: string
  temperature: number | null
  max_tokens: number | null
  top_p: number | null
  config: Record<string, unknown> | null
  is_active: boolean
  last_tested_at: string | null
  test_status: string | null
  created_at: string
  updated_at: string
}

// ===== Skill Script =====
export interface SkillScript {
  name: string
  content: string
  language: string  // python, bash, javascript
}

// ===== Skill (渐进式披露模型) =====
// Layer 1: name + description (始终加载，用于 AI 发现匹配)
// Layer 2: instructions (按需加载，详细指令和步骤)
// Layer 3: references, examples, scripts (执行时按需加载)
export interface Skill {
  name: string
  description: string
  // Layer 2
  instructions?: string | null
  // Layer 3
  references?: string | null
  examples?: string | null
  scripts?: SkillScript[] | null
  // 元数据
  allowed_tools?: string[] | null
  metadata?: Record<string, unknown> | null
  // 层级分组
  children?: Skill[]
}

// ===== Agent =====
export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string | null
  skills: Skill[] | null
  mcp_config: Record<string, unknown> | null
  agent_type: string
  agent_config: Record<string, unknown> | null
  tags: string[] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ===== Assertion =====
export interface Assertion {
  type: string
  value?: unknown
  critical?: boolean
}

export interface AssertionResult {
  type: string
  value?: unknown
  passed: boolean
  reason: string
  critical?: boolean
}

// ===== Sub Goal =====
export interface SubGoal {
  id: string
  description: string
  check_type: string  // contains, tool_called, llm_judge, regex_match
  check_value?: unknown
  weight: number
}

// ===== Test Case =====
export interface TestCase {
  id: string
  input: string
  expected_output?: string
  metadata?: Record<string, unknown>
  assertions?: Assertion[]
  sub_goals?: SubGoal[]
  expected_trajectory?: Record<string, unknown>[]
  // 多轮对话支持
  type?: 'single' | 'multi_turn'
  turns?: ConversationTurn[]
}

// ===== Multi-Turn Conversation =====
export interface ConversationTurn {
  user_message: string
  expected_response?: string
  assertions?: Assertion[]
  sub_goals?: SubGoal[]
}

// ===== Test Suite =====
export interface TestSuite {
  id: string
  name: string
  description: string
  test_cases: TestCase[]
  tags: string[] | null
  source: string
  generation_config: Record<string, unknown> | null
  version: number
  parent_id: string | null
  changelog: string | null
  created_at: string
  updated_at: string
  case_count: number
}

// ===== Trajectory Step =====
export interface TrajectoryStep {
  step_index: number
  step_type: 'thinking' | 'tool_call' | 'tool_result' | 'text_output'
  content: string
  tool_name?: string
  tool_args?: string
  tool_result?: string
  timestamp_ms: number
  duration_ms: number
}

// ===== Eval Result =====
export interface EvalResult {
  id: string
  eval_run_id: string
  test_case_id: string
  input: string
  expected_output: string | null
  agent_output: string | null
  agent_thinking: string | null
  skills_called: Record<string, unknown>[] | null
  trajectory: TrajectoryStep[] | null
  trajectory_scores: Record<string, number> | null
  trajectory_overall: number | null
  trajectory_reasoning: string | null
  scores: Record<string, number>
  overall_score: number
  passed: boolean
  assertion_results?: AssertionResult[] | null
  critical_failure?: boolean
  reasoning: string | null
  latency_ms: number | null
  token_usage: Record<string, number> | null
  error_message: string | null
  // Phase 2+ 新增字段
  progress_rate?: number | null
  sub_goal_results?: Record<string, unknown>[] | null
  grounding_accuracy?: number | null
  tool_eval_results?: Record<string, unknown> | null
  failure_analysis?: FailureAnalysis | null
  cost_data?: CostData | null
  created_at: string
}

// ===== Eval Run =====
export interface EvalRun {
  id: string
  agent_id: string
  test_suite_id: string
  judge_config_id: string | null   // 保留 snake_case 字段名（后端返回）— 语义已改为 model_config_id
  agent_snapshot: Record<string, unknown>
  test_suite_snapshot: Record<string, unknown>
  dimensions: string[]
  enable_skills_eval: boolean
  enable_trajectory_eval: boolean
  trajectory_dimensions: string[]
  concurrency: number
  timeout: number
  template_id?: string | null
  model_override?: string | null
  is_baseline?: boolean
  baseline_run_id?: string | null
  repeat_count?: number
  pass_at_k?: Record<string, unknown> | null
  status: string
  progress: number
  current_item: number
  total_items: number
  passed_count: number
  failed_count: number
  average_score: number | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  agent_name: string
  test_suite_name: string
  model_config_name: string
  results?: EvalResult[]
}

// ===== Dashboard =====
export interface DashboardStats {
  total_agents: number
  total_test_suites: number
  total_eval_runs: number
  total_eval_results: number
  completed_runs: number
  failed_runs: number
  running_runs: number
  avg_score: number
  avg_latency_ms: number
  dimension_averages: Record<string, number>
  agent_stats: Array<{
    id: string; name: string; agent_type: string
    avg_score: number; avg_latency_ms: number
    total_runs: number; total_results: number
  }>
  score_distribution?: { excellent: number; good: number; fair: number; poor: number }
  recent_runs: Array<{
    id: string; agent_name: string; test_suite_name: string
    status: string; progress: number; total_items: number
    average_score: number | null; created_at: string
  }>
}

// ===== Observability =====
export interface ObsStats {
  total_traces: number
  total_observations: number
  trace_latency_table: PercentileRow[]
  generation_latency_table: PercentileRow[]
  span_latency_table: PercentileRow[]
  model_latency_table: ModelPercentileRow[]
  model_usage_table: ModelUsageRow[]
}

export interface PercentileRow {
  name: string; count: number; p50: number; p90: number; p95: number; p99: number
}
export interface ModelPercentileRow extends PercentileRow { model?: string }
export interface ModelUsageRow {
  model: string; count: number; total_tokens: number; prompt_tokens: number; completion_tokens: number
}

// ===== Trace Record (新 observability API) =====
export interface TraceRecord {
  id: string
  agent_id: string | null
  agent_name: string | null
  source: string
  name: string
  input: string | null
  output: string | null
  status: string
  total_latency_ms: number | null
  total_tokens: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_cost: number | null
  llm_call_count: number
  tool_call_count: number
  session_id: string | null
  user_id: string | null
  metadata: Record<string, unknown> | null
  tags: string[] | null
  start_time: string | null
  end_time: string | null
  created_at: string
}

// ===== Span Record (新 observability API) =====
export interface SpanRecord {
  id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  kind: string  // 'llm' | 'tool' | 'retrieval' | 'agent' | 'chain' | 'other'
  status: string
  status_message: string | null
  start_time: string | null
  end_time: string | null
  latency_ms: number | null
  input: string | null
  output: string | null
  attributes: Record<string, unknown> | null
  events: unknown[] | null
  // LLM 特有字段
  llm_model?: string | null
  llm_prompt?: string | null
  llm_completion?: string | null
  llm_prompt_tokens?: number | null
  llm_completion_tokens?: number | null
  llm_total_tokens?: number | null
  llm_temperature?: number | null
  llm_cost?: number | null
  llm_finish_reason?: string | null
  // Tool 特有字段
  tool_name?: string | null
  tool_input?: string | null
  tool_output?: string | null
  tool_status?: string | null
  // Retrieval 特有字段
  retrieval_query?: string | null
  retrieval_doc_count?: number | null
  retrieval_documents?: string | null
  // 树形结构
  children?: SpanRecord[]
}

// ===== Trace Detail (含 Span 树和关联 EvalResult) =====
export interface TraceDetail extends TraceRecord {
  spans: SpanRecord[]
  eval_results: Array<{
    id: string
    test_case_id: string
    overall_score: number
    passed: boolean
    scores: Record<string, number>
    reasoning: string | null
    created_at: string | null
  }>
}

// ===== Eval Template =====
export interface EvalTemplate {
  id: string
  name: string
  category: string
  description: string | null
  is_builtin: boolean
  dimension_config: Array<{ dimensionId: string; weight: number; enabled: boolean }>
  created_at: string
  updated_at: string
}

// ===== Eval Dimension =====
export interface EvalDimension {
  id: string
  name: string
  display_name: string
  description: string
  layer: string
  scoring_method: string
  scoring_criteria: string | null
  evaluation_steps: string | null
  weight: number
  requires_reference: boolean
}

// ===== Bad Case =====
export interface BadCase {
  id: string
  agent_id: string
  input: string
  expected_output: string | null
  actual_output: string | null
  assertions: Assertion[] | null
  source: string
  eval_result_id: string | null
  status: string
  tags: string[] | null
  root_cause: string | null
  created_at: string
  updated_at: string
}

// ===== Comparison Run =====
export interface ComparisonRun {
  id: string
  name: string
  mode: string
  test_suite_id: string
  template_id: string | null
  eval_run_ids: string[]
  model_labels: string[]
  repeat_count: number
  comparison_data: {
    models: Record<string, {
      pass_rate: number
      avg_score: number
      avg_latency_ms: number
      dimension_scores: Record<string, number>
      total_results: number
      run_ids: string[]
      score_variance: number
      error_count?: number
      error_summary?: Record<string, number>
    }>
    model_labels: string[]
  } | null
  status: string
  created_at: string
  updated_at: string
}

// ===== Skills Analysis =====
export interface SkillsAnalysis {
  id: string
  agent_id: string
  usage_stats: Record<string, {
    count: number
    success_rate: number
    p50_ms: number
    avg_ms: number
    health: string
  }>
  security_review: Record<string, unknown> | null
  design_review: Record<string, unknown> | null
  created_at: string
}

// ===== Regression =====
export interface RegressionReport {
  baseline_run_id: string
  current_run_id: string
  dimension_changes: Record<string, {
    baseline_avg: number
    current_avg: number
    change_pct: number
    level: string
  }>
  pass_rate_change: {
    baseline: number
    current: number
    change_pct: number
  } | null
  new_failures: string[]
  new_passes: string[]
  summary: string
}

// ===== Bad Case Stats =====
export interface BadCaseStats {
  total: number
  open: number
  investigating: number
  resolved: number
  exported: number
}

// ===== Experiment =====
export interface ExperimentVariable {
  type: string  // model, prompt, temperature, tool_config
  values: unknown[]
}

export interface ExperimentCombinationResult {
  combination: Record<string, unknown>
  run_id: string | null
  status?: string
  average_score?: number | null
  passed_count?: number | null
  failed_count?: number | null
  total_items?: number
  pass_rate?: number
}

export interface Experiment {
  id: string
  name: string
  description: string | null
  agent_id: string
  test_suite_id: string
  variables: ExperimentVariable[]
  eval_run_ids: string[]
  result_matrix: {
    combinations: ExperimentCombinationResult[]
    total: number
    variables: ExperimentVariable[]
  } | null
  dimensions: string[] | null
  model_config_id: string | null
  completed_combinations: number
  created_at: string
  updated_at: string
}

// ===== Insight =====
export interface InsightItem {
  type: string  // prompt_optimization, tool_usage, model_selection, performance, quality
  severity: string  // info, warning, critical
  title: string
  description: string
  suggestion: string
  related_data: Record<string, unknown> | null
}

export interface AgentInsights {
  agent_id: string
  agent_name: string
  total_runs: number
  insights: InsightItem[]
  summary: string
}

// ===== Failure Analysis =====
export interface FailureAnalysis {
  primary_cause: string
  explanation: string
  suggested_fix: string
  confidence: number
}

// ===== Cost Data =====
export interface CostData {
  agent_cost: { input_cost: number; output_cost: number; total_cost: number; model: string }
  judge_cost: { input_cost: number; output_cost: number; total_cost: number; model: string }
  total_cost: number
}

// ===== Error Breakdown =====
export interface ErrorBreakdown {
  run_id: string
  total_failed: number
  breakdown: Array<{ cause: string; count: number; percentage: number }>
  details: Array<{
    test_case_id: string
    primary_cause: string
    explanation: string
    suggested_fix: string
    confidence: number
  }>
}

export interface AgentErrorBreakdown {
  agent_id: string
  agent_name: string
  total_runs: number
  total_failed: number
  breakdown: Array<{ cause: string; count: number; percentage: number }>
  trend: Array<{
    run_id: string
    created_at: string
    causes: Record<string, number>
  }>
}

// ===== Live Run Stats =====
export interface LiveRunStats {
  running_count: number
  runs: Array<{
    run_id: string
    agent_name: string
    test_suite_name: string
    progress: number
    total_items: number
    completed_items: number
    passed: number
    failed: number
    current_pass_rate: number
    elapsed_seconds: number
    estimated_remaining: number | null
    started_at: string | null
  }>
}

// ===== Capability Radar =====
export interface CapabilityRadar {
  agent_id: string
  agent_name: string
  dimensions: Record<string, number>
  total_results: number
}

// ===== Score (独立评分实体) =====
export interface Score {
  id: string
  trace_id: string
  span_id: string | null
  name: string
  value: number | null
  string_value: string | null
  comment: string | null
  source: string  // manual, automated, sdk, user_feedback
  author: string | null
  eval_config_id: string | null
  created_at: string
  updated_at: string
}

export interface ScoreStats {
  dimensions: Array<{
    name: string
    count: number
    average: number | null
    min: number | null
    max: number | null
    distribution: { excellent: number; good: number; fair: number; poor: number }
    sources: Record<string, number>
  }>
  total_scores: number
}

// ===== Annotation Queue =====
export interface ScoreConfig {
  name: string
  type: 'numeric' | 'categorical'
  min?: number
  max?: number
  description?: string
  options?: string[]
}

export interface AnnotationQueue {
  id: string
  name: string
  description: string | null
  filter_config: Record<string, unknown>
  score_configs: ScoreConfig[]
  assignees: string[] | null
  total_items: number
  completed_items: number
  status: string  // active, paused, completed
  created_at: string
  updated_at: string
}

// ===== Online Eval Config =====
export interface AlertRule {
  dimension: string
  threshold: number
  operator: 'lt' | 'gt' | 'lte' | 'gte'
  action: string
  target?: string
}

export interface OnlineEvalConfig {
  id: string
  name: string
  description: string | null
  agent_ids: string[]
  dimensions: string[]
  model_config_id: string
  sample_rate: number
  is_active: boolean
  alert_rules: AlertRule[] | null
  created_at: string
  updated_at: string
}
