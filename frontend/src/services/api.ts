import type { ModelConfig, Agent, TestSuite, EvalRun, EvalResult, DashboardStats, ObsStats, TraceRecord, TraceDetail, EvalTemplate, EvalDimension, BadCase, BadCaseStats, ComparisonRun, SkillsAnalysis, RegressionReport, Experiment, AgentInsights, ErrorBreakdown, AgentErrorBreakdown, LiveRunStats, CapabilityRadar, Score, ScoreStats, AnnotationQueue, OnlineEvalConfig } from '../types'

const API = '/api'

// 全局错误事件，供 App 层订阅
type ApiErrorHandler = (error: Error, url: string) => void
let _onApiError: ApiErrorHandler | null = null

export function setApiErrorHandler(handler: ApiErrorHandler) {
  _onApiError = handler
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    const error = new Error(err.detail || 'Request failed')
    if (_onApiError) {
      _onApiError(error, url)
    }
    throw error
  }
  return resp.json()
}

// ===== Dashboard =====
export const fetchDashboard = (agentId?: string) => {
  const qs = agentId ? `?agent_id=${agentId}` : ''
  return request<DashboardStats>(`/dashboard${qs}`)
}

export interface AgentTrendPoint {
  run_id: string
  test_suite_name: string
  avg_score: number
  pass_rate: number
  avg_latency_ms: number
  total_items: number
  passed_count: number
  failed_count: number
  dimension_averages: Record<string, number>
  created_at: string
}

export const fetchAgentTrend = (agentId: string) =>
  request<{ agent_id: string; trend: AgentTrendPoint[] }>(`/dashboard/agent-trend?agent_id=${agentId}`)


// ===== Model Configs =====
export const fetchModelConfigs = () => request<ModelConfig[]>('/model-configs')
export const createModelConfig = (data: unknown) => request<ModelConfig>('/model-configs', { method: 'POST', body: JSON.stringify(data) })
export const updateModelConfig = (id: string, data: unknown) => request<ModelConfig>(`/model-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteModelConfig = (id: string) => request<void>(`/model-configs/${id}`, { method: 'DELETE' })
export const testModelConfig = (id: string) => request<{ success: boolean; content?: string; error?: string; latency_ms: number }>(`/model-configs/${id}/test`, { method: 'POST' })
export const toggleModelConfig = (id: string) => request<{ is_active: boolean }>(`/model-configs/${id}/activate`, { method: 'POST' })

// ===== Agents =====
export const fetchAgents = () => request<Agent[]>('/agents')
export const createAgent = (data: unknown) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) })
export const updateAgent = (id: string, data: unknown) => request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAgent = (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' })
export const testAgent = (id: string) => request<{ success: boolean; latency_ms?: number; content?: string; error?: string }>(`/agents/${id}/test`, { method: 'POST' })

// ===== Test Suites =====
export const fetchTestSuites = () => request<TestSuite[]>('/test-suites')
export const fetchTestSuite = (id: string) => request<TestSuite>(`/test-suites/${id}`)
export const createTestSuite = (data: unknown) => request<TestSuite>('/test-suites', { method: 'POST', body: JSON.stringify(data) })
export const updateTestSuite = (id: string, data: unknown) => request<TestSuite>(`/test-suites/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTestSuite = (id: string) => request<void>(`/test-suites/${id}`, { method: 'DELETE' })
export const generateTestCases = (data: unknown) => request<TestSuite>('/test-suites/generate', { method: 'POST', body: JSON.stringify(data) })

// ===== Eval Runs =====
export const fetchEvalRuns = () => request<EvalRun[]>('/eval-runs')
export const fetchEvalRun = (id: string) => request<EvalRun>(`/eval-runs/${id}`)
export const createEvalRun = (data: unknown) => request<EvalRun>('/eval-runs', { method: 'POST', body: JSON.stringify(data) })
export const deleteEvalRun = (id: string) => request<void>(`/eval-runs/${id}`, { method: 'DELETE' })
export const cancelEvalRun = (id: string) => request<void>(`/eval-runs/${id}/cancel`, { method: 'POST' })
export const fetchEvalResults = (runId: string) => request<EvalResult[]>(`/eval-runs/${runId}/results`)
export const setBaseline = (runId: string) => request<{ message: string }>(`/eval-runs/${runId}/set-baseline`, { method: 'POST' })
export const fetchRegression = (runId: string) => request<RegressionReport>(`/eval-runs/${runId}/regression`)

// ===== Eval Framework =====
export const fetchTemplates = (category?: string) => request<EvalTemplate[]>(`/eval-framework/templates${category ? `?category=${category}` : ''}`)
export const fetchTemplate = (id: string) => request<EvalTemplate>(`/eval-framework/templates/${id}`)
export const createTemplate = (data: unknown) => request<EvalTemplate>('/eval-framework/templates', { method: 'POST', body: JSON.stringify(data) })
export const updateTemplate = (id: string, data: unknown) => request<EvalTemplate>(`/eval-framework/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTemplate = (id: string) => request<void>(`/eval-framework/templates/${id}`, { method: 'DELETE' })
export const copyTemplate = (id: string) => request<EvalTemplate>(`/eval-framework/templates/${id}/copy`, { method: 'POST' })
export const fetchDimensions = (layer?: string) => request<EvalDimension[]>(`/eval-framework/dimensions${layer ? `?layer=${layer}` : ''}`)

// ===== Comparisons =====
export const fetchComparisons = () => request<ComparisonRun[]>('/comparisons')
export const fetchComparison = (id: string) => request<ComparisonRun>(`/comparisons/${id}`)
export const createComparison = (data: unknown) => request<ComparisonRun>('/comparisons', { method: 'POST', body: JSON.stringify(data) })
export const deleteComparison = (id: string) => request<void>(`/comparisons/${id}`, { method: 'DELETE' })
export interface ComparisonProgress {
  id: string; status: string
  model_progress: Array<{ label: string; run_ids: string[]; progress: number; total_items: number; completed_items: number; statuses: string[] }>
}
export const fetchComparisonProgress = (id: string) => request<ComparisonProgress>(`/comparisons/${id}/progress`)

// ===== Bad Cases =====
export const fetchBadCases = (params?: { agent_id?: string; status?: string; source?: string }) => {
  const qs = new URLSearchParams()
  if (params?.agent_id) qs.set('agent_id', params.agent_id)
  if (params?.status) qs.set('status', params.status)
  if (params?.source) qs.set('source', params.source)
  const q = qs.toString()
  return request<BadCase[]>(`/bad-cases${q ? `?${q}` : ''}`)
}
export const createBadCase = (data: unknown) => request<BadCase>('/bad-cases', { method: 'POST', body: JSON.stringify(data) })
export const updateBadCase = (id: string, data: unknown) => request<BadCase>(`/bad-cases/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteBadCase = (id: string) => request<void>(`/bad-cases/${id}`, { method: 'DELETE' })
export const importBadCase = (data: { eval_result_id: string; tags?: string[] }) => request<BadCase>('/bad-cases/import', { method: 'POST', body: JSON.stringify(data) })
export const exportBadCases = (data: { bad_case_ids: string[]; test_suite_id: string }) => request<{ exported_count: number }>('/bad-cases/export', { method: 'POST', body: JSON.stringify(data) })
export const fetchBadCaseStats = () => request<BadCaseStats>('/bad-cases/stats/summary')

// ===== Trace → Test Case / Bad Case (Phase 1 新增) =====
export const importTraceToSuite = (suiteId: string, data: { input: string; expected_output?: string; metadata?: Record<string, unknown> }) =>
  request<import('../types').TestSuite>(`/test-suites/${suiteId}/import-trace`, { method: 'POST', body: JSON.stringify(data) })

export const createBadCaseFromTrace = (data: { agent_id: string; input: string; actual_output?: string; tags?: string[]; root_cause?: string }) =>
  request<BadCase>('/bad-cases/from-trace', { method: 'POST', body: JSON.stringify(data) })

// ===== Playground =====
export interface PlaygroundChatResponse {
  content: string; thinking: string; latency_ms: number
  token_usage: Record<string, number>; tool_calls: Array<Record<string, unknown>>; error: string | null
}
export interface PlaygroundCompareItem extends PlaygroundChatResponse { label: string }

export const playgroundChat = (data: { agent_id: string; message: string; config_overrides?: Record<string, unknown> }) =>
  request<PlaygroundChatResponse>('/playground/chat', { method: 'POST', body: JSON.stringify(data) })

export const playgroundCompare = (data: { agent_id: string; message: string; configs: Array<Record<string, unknown>> }) =>
  request<{ results: PlaygroundCompareItem[] }>('/playground/compare', { method: 'POST', body: JSON.stringify(data) })

// ===== Experiments =====
export const fetchExperiments = () => request<Experiment[]>('/experiments')
export const fetchExperiment = (id: string) => request<Experiment>(`/experiments/${id}`)
export const createExperiment = (data: unknown) => request<Experiment>('/experiments', { method: 'POST', body: JSON.stringify(data) })
export const deleteExperiment = (id: string) => request<void>(`/experiments/${id}`, { method: 'DELETE' })

// ===== Test Suite Versions =====
export const createTestSuiteVersion = (id: string, data: { changelog?: string; test_cases?: unknown[] }) =>
  request<TestSuite>(`/test-suites/${id}/create-version`, { method: 'POST', body: JSON.stringify(data) })
export const fetchTestSuiteVersions = (id: string) => request<TestSuite[]>(`/test-suites/${id}/versions`)

// ===== Insights =====
export const fetchAgentInsights = (agentId: string) => request<AgentInsights>(`/insights/${agentId}`)

// ===== Error Breakdown =====
export const fetchErrorBreakdown = (runId: string) => request<ErrorBreakdown>(`/error-breakdown/${runId}`)
export const fetchAgentErrorBreakdown = (agentId: string, limit?: number) => {
  const qs = limit ? `?limit=${limit}` : ''
  return request<AgentErrorBreakdown>(`/error-breakdown/agent/${agentId}${qs}`)
}

// ===== Live Stats =====
export const fetchLiveStats = () => request<LiveRunStats>('/dashboard/live-stats')

// ===== Capability Radar =====
export const fetchCapabilityRadar = (agentId: string) => request<CapabilityRadar>(`/dashboard/capability-radar/${agentId}`)

// ===== Skills Analysis =====
export const fetchSkillsAnalyses = (agentId?: string) => request<SkillsAnalysis[]>(`/skills-analysis${agentId ? `?agent_id=${agentId}` : ''}`)
export const fetchSkillsAnalysis = (id: string) => request<SkillsAnalysis>(`/skills-analysis/${id}`)
export const triggerSkillsAnalysis = (data: { agent_id: string; model_config_id?: string }) => request<SkillsAnalysis>('/skills-analysis', { method: 'POST', body: JSON.stringify(data) })
export const deleteSkillsAnalysis = (id: string) => request<void>(`/skills-analysis/${id}`, { method: 'DELETE' })

// ===== Observability (替代 Langfuse Proxy) =====
export const fetchObsStats = (agentId?: string) => {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : ''
  return request<ObsStats>(`/observability/observations/stats${qs}`)
}

// ===== Trace API (新 observability) =====
export const fetchTraces = (params?: { page?: number; limit?: number; agent_id?: string; source?: string; name?: string; days?: number }) => {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.agent_id) qs.set('agent_id', params.agent_id)
  if (params?.source) qs.set('source', params.source)
  if (params?.name) qs.set('name', params.name)
  if (params?.days) qs.set('days', String(params.days))
  const q = qs.toString()
  return request<{ data: TraceRecord[]; total: number; page: number; limit: number; pages: number }>(`/observability/traces${q ? `?${q}` : ''}`)
}

export const fetchTraceDetail = (traceId: string) =>
  request<TraceDetail>(`/observability/traces/${traceId}`)

// ===== Scores =====
export const createScore = (data: {
  trace_id: string; name: string; source: string;
  span_id?: string; value?: number; string_value?: string;
  comment?: string; author?: string; eval_config_id?: string;
}) => request<Score>('/scores', { method: 'POST', body: JSON.stringify(data) })

export const fetchScores = (params?: {
  trace_id?: string; span_id?: string; name?: string;
  source?: string; author?: string; page?: number; limit?: number;
}) => {
  const qs = new URLSearchParams()
  if (params?.trace_id) qs.set('trace_id', params.trace_id)
  if (params?.span_id) qs.set('span_id', params.span_id)
  if (params?.name) qs.set('name', params.name)
  if (params?.source) qs.set('source', params.source)
  if (params?.author) qs.set('author', params.author)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  return request<{ data: Score[]; total: number; page: number; limit: number; pages: number }>(`/scores${q ? `?${q}` : ''}`)
}

export const fetchScore = (id: string) => request<Score>(`/scores/${id}`)

export const updateScore = (id: string, data: {
  name?: string; value?: number; string_value?: string;
  comment?: string; source?: string; author?: string; span_id?: string;
}) => request<Score>(`/scores/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteScore = (id: string) => request<void>(`/scores/${id}`, { method: 'DELETE' })

export const fetchScoreStats = (params?: { name?: string; source?: string; trace_id?: string; days?: number }) => {
  const qs = new URLSearchParams()
  if (params?.name) qs.set('name', params.name)
  if (params?.source) qs.set('source', params.source)
  if (params?.trace_id) qs.set('trace_id', params.trace_id)
  if (params?.days) qs.set('days', String(params.days))
  const q = qs.toString()
  return request<ScoreStats>(`/scores/stats${q ? `?${q}` : ''}`)
}

export const fetchTraceScores = (traceId: string) =>
  request<Score[]>(`/traces/${traceId}/scores`)

// ===== Annotation Queues =====
export const createAnnotationQueue = (data: unknown) =>
  request<AnnotationQueue>('/annotation-queues', { method: 'POST', body: JSON.stringify(data) })

export const fetchAnnotationQueues = () =>
  request<AnnotationQueue[]>('/annotation-queues')

export const fetchAnnotationQueue = (id: string) =>
  request<AnnotationQueue>(`/annotation-queues/${id}`)

export const updateAnnotationQueue = (id: string, data: unknown) =>
  request<AnnotationQueue>(`/annotation-queues/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteAnnotationQueue = (id: string) =>
  request<void>(`/annotation-queues/${id}`, { method: 'DELETE' })

export const fetchAnnotationQueueItems = (id: string, params?: { page?: number; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  return request<{ data: TraceRecord[]; total: number }>(`/annotation-queues/${id}/items${q ? `?${q}` : ''}`)
}

export const completeAnnotation = (queueId: string, traceId: string) =>
  request<{ message: string }>(`/annotation-queues/${queueId}/items/${traceId}/complete`, { method: 'POST' })

// ===== Online Eval =====
export const createOnlineEvalConfig = (data: unknown) =>
  request<OnlineEvalConfig>('/online-eval/configs', { method: 'POST', body: JSON.stringify(data) })

export const fetchOnlineEvalConfigs = () =>
  request<OnlineEvalConfig[]>('/online-eval/configs')

export const updateOnlineEvalConfig = (id: string, data: unknown) =>
  request<OnlineEvalConfig>(`/online-eval/configs/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteOnlineEvalConfig = (id: string) =>
  request<void>(`/online-eval/configs/${id}`, { method: 'DELETE' })

export const toggleOnlineEvalConfig = (id: string) =>
  request<{ is_active: boolean }>(`/online-eval/configs/${id}/toggle`, { method: 'POST' })

export const fetchOnlineEvalStats = () =>
  request<Record<string, unknown>>('/online-eval/stats')

// ===== Batch Import Traces → TestCase =====
export const batchImportTraces = (data: {
  trace_ids: string[]; suite_id: string;
  include_expected_output?: boolean; include_trajectory?: boolean;
}) => request<{ imported: number; total_cases: number }>('/test-suites/batch-import-traces', { method: 'POST', body: JSON.stringify(data) })

// ===== Genes (策略基因库) =====
export interface Gene {
  id: string; name: string; description?: string; category: string
  signals_match: string[]; prompt_patch: string; source: string
  source_id?: string; agent_id?: string; is_active: boolean
  effectiveness: number; usage_count: number; tags?: string[]
  metadata?: Record<string, unknown>; created_at: string; updated_at: string
}

export const fetchGenes = (params?: {
  agent_id?: string; category?: string; source?: string
  is_active?: boolean; search?: string; order_by?: string
  order_dir?: string; limit?: number; offset?: number
}) => {
  const qs = new URLSearchParams()
  if (params?.agent_id) qs.set('agent_id', params.agent_id)
  if (params?.category) qs.set('category', params.category)
  if (params?.source) qs.set('source', params.source)
  if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active))
  if (params?.search) qs.set('search', params.search)
  if (params?.order_by) qs.set('order_by', params.order_by)
  if (params?.order_dir) qs.set('order_dir', params.order_dir)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const q = qs.toString()
  return request<Gene[]>(`/genes${q ? `?${q}` : ''}`)
}
export const fetchGene = (id: string) => request<Gene>(`/genes/${id}`)
export const createGene = (data: unknown) => request<Gene>('/genes', { method: 'POST', body: JSON.stringify(data) })
export const updateGene = (id: string, data: unknown) => request<Gene>(`/genes/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteGene = (id: string) => request<void>(`/genes/${id}`, { method: 'DELETE' })
export const importGenes = (data: { genes: unknown[] }) => request<{ imported: number }>('/genes/import', { method: 'POST', body: JSON.stringify(data) })
export const exportGenes = (params?: { agent_id?: string; category?: string; format?: string }) => {
  const qs = new URLSearchParams()
  if (params?.agent_id) qs.set('agent_id', params.agent_id)
  if (params?.category) qs.set('category', params.category)
  if (params?.format) qs.set('format', params.format)
  const q = qs.toString()
  return request<{ genes: Gene[]; format: string; count: number }>(`/genes/export/json${q ? `?${q}` : ''}`)
}
export const matchGenes = (signals: string[], agentId?: string) => {
  const qs = agentId ? `?agent_id=${agentId}` : ''
  return request<{ matched: Gene[]; count: number }>(`/genes/match${qs}`, { method: 'POST', body: JSON.stringify(signals) })
}

// ===== Bad Case → Gene Distill =====
export const distillGene = (badCaseId: string, data?: unknown) =>
  request<Gene>(`/bad-cases/${badCaseId}/distill-gene`, { method: 'POST', body: data ? JSON.stringify(data) : undefined })
export const batchDistillGenes = (data: { bad_case_ids: string[]; merge_similar?: boolean }) =>
  request<{ genes: Gene[]; count: number }>('/bad-cases/batch-distill', { method: 'POST', body: JSON.stringify(data) })

// ===== Improvement Report =====
export interface ImprovementReport {
  eval_run_id: string; agent_name: string; report_markdown: string
  summary: { total_cases: number; pass_rate: number; avg_score: number }
  weak_dimensions: string[]; top_failures: string[]
  recommended_genes: Gene[]
}
export const fetchImprovementReport = (evalRunId: string, lang?: string) =>
  request<ImprovementReport>(`/improvement-report/${evalRunId}${lang ? `?lang=${lang}` : ''}`)

// ===== Evolution =====
export interface EvolutionEvent {
  id: string; agent_id: string; event_type: string
  event_data: Record<string, unknown>; scores_before?: Record<string, number>
  scores_after?: Record<string, number>; summary: string; created_at: string
}
export interface EvolutionTimeline {
  agent_id: string; events: EvolutionEvent[]
  score_trend: Array<{ date: string; score: number }>
  pass_rate_trend: Array<{ date: string; pass_rate: number }>
  dimension_trends: Record<string, Array<{ date: string; score: number }>>
  milestones: EvolutionEvent[]
}
export const fetchEvolutionTimeline = (agentId: string, params?: { days?: number; event_type?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.days) qs.set('days', String(params.days))
  if (params?.event_type) qs.set('event_type', params.event_type)
  if (params?.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  return request<EvolutionTimeline>(`/evolution/timeline/${agentId}${q ? `?${q}` : ''}`)
}

// ===== Eval Knowledge =====
export interface AgentCategory { value: string; label_zh: string; label_en: string }
export interface EvalBaseline {
  agent_category: string; sample_count: number
  dimension_means: Record<string, number>; failure_ratios: Record<string, number>
  overall_score: number; pass_rate: number
}
export interface EvalRecommendation {
  agent_id: string; below_baseline: Array<{ dimension: string; current: number; baseline: number }>
  top_failures: Array<{ category: string; ratio: number }>
  recommended_genes: Gene[]
}
export const fetchAgentCategories = () => request<{ categories: AgentCategory[] }>('/eval-knowledge/categories')
export const fetchEvalBaseline = (params: { agent_category: string; agent_id?: string }) => {
  const qs = new URLSearchParams({ agent_category: params.agent_category })
  if (params.agent_id) qs.set('agent_id', params.agent_id)
  return request<EvalBaseline>(`/eval-knowledge/baseline?${qs}`)
}
export const fetchEvalRecommendations = (agentId: string) => request<EvalRecommendation>(`/eval-knowledge/recommendations/${agentId}`)
