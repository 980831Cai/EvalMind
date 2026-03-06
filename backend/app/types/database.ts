// ============================================================
// Agent 评测平台 MVP 类型定义
// ============================================================
// 版本: 1.0.0
// 日期: 2026-02-24
// 说明: 数据库模型对应的 TypeScript 类型
// ============================================================

// ============================================================
// 1. 模型配置
// ============================================================

export interface ModelConfig {
  id: string;
  provider: 'openai' | 'deepseek' | 'anthropic' | 'ollama' | 'custom';
  modelName: string;
  baseUrl: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  config?: Record<string, any>;
  isActive: boolean;
  lastTestedAt?: Date;
  testStatus?: 'success' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateModelConfigInput {
  provider: ModelConfig['provider'];
  modelName: string;
  baseUrl: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  config?: Record<string, any>;
}

export interface UpdateModelConfigInput extends Partial<CreateModelConfigInput> {
  isActive?: boolean;
}

// ============================================================
// 2. Agent 配置
// ============================================================

export interface Skill {
  name: string;
  description: string;
  // 可扩展字段
  category?: 'tool' | 'capability' | 'task';
  enabled?: boolean;
  config?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  skills: Skill[];
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  systemPrompt: string;
  skills: Skill[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

// ============================================================
// 3. 测试套件
// ============================================================

export interface TestCase {
  id: string;
  input: string;
  expectedOutput?: string;
  metadata?: {
    difficulty?: 'easy' | 'medium' | 'hard';
    category?: string;
    tags?: string[];
    [key: string]: any;
  };
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  testCases: TestCase[];
  tags?: string[];
  source: 'manual' | 'imported' | 'generated';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTestSuiteInput {
  name: string;
  description?: string;
  testCases: Omit<TestCase, 'id'>[];
  tags?: string[];
  source?: TestSuite['source'];
}

export interface UpdateTestSuiteInput {
  name?: string;
  description?: string;
  testCases?: TestCase[];
  tags?: string[];
}

// 批量导入
export interface ImportTestCasesInput {
  format: 'csv' | 'json';
  data: string | TestCase[];
}

// ============================================================
// 4. 评测运行
// ============================================================

export type EvalRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface EvalRunConfig {
  dimensions: string[];
  concurrency?: number;
  timeout?: number;
}

export interface EvalRun {
  id: string;
  agentId: string;
  testSuiteId: string;
  agentSnapshot: Agent;
  testSuiteSnapshot: TestSuite;
  dimensions: string[];
  concurrency: number;
  timeout: number;
  status: EvalRunStatus;
  progress: number;
  currentItem: number;
  totalItems: number;
  passedCount: number;
  failedCount: number;
  averageScore?: number;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CreateEvalRunInput {
  agentId: string;
  testSuiteId: string;
  dimensions?: string[];
  concurrency?: number;
  timeout?: number;
}

// 评测进度更新（WebSocket 推送）
export interface EvalRunProgress {
  evalRunId: string;
  status: EvalRunStatus;
  progress: number;
  currentItem: number;
  totalItems: number;
  passedCount: number;
  failedCount: number;
  averageScore?: number;
  currentTestCase?: {
    id: string;
    input: string;
  };
}

// ============================================================
// 5. 评测结果
// ============================================================

export interface EvalScores {
  accuracy?: number;
  helpfulness?: number;
  relevance?: number;
  [dimension: string]: number | undefined;
}

export interface SkillCall {
  skill: string;
  params: Record<string, any>;
  result?: any;
  timestamp?: string;
  success?: boolean;
  errorMessage?: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface EvalResult {
  id: string;
  evalRunId: string;
  testCaseId: string;
  input: string;
  expectedOutput?: string;
  agentOutput?: string;
  agentThinking?: string;
  skillsCalled?: SkillCall[];
  scores: EvalScores;
  overallScore: number;
  passed: boolean;
  reasoning?: string;
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  errorMessage?: string;
  createdAt: Date;
}

// 创建评测结果（内部使用）
export interface CreateEvalResultInput {
  evalRunId: string;
  testCaseId: string;
  input: string;
  expectedOutput?: string;
  agentOutput?: string;
  agentThinking?: string;
  skillsCalled?: SkillCall[];
  scores: EvalScores;
  overallScore: number;
  passed: boolean;
  reasoning?: string;
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  errorMessage?: string;
}

// ============================================================
// 6. API 响应类型
// ============================================================

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 列表查询参数
export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// Agent 列表查询
export interface ListAgentsParams extends ListQueryParams {
  tags?: string[];
}

// 测试套件列表查询
export interface ListTestSuitesParams extends ListQueryParams {
  source?: TestSuite['source'];
  tags?: string[];
}

// 评测运行列表查询
export interface ListEvalRunsParams extends ListQueryParams {
  agentId?: string;
  testSuiteId?: string;
  status?: EvalRunStatus;
}

// 评测结果列表查询
export interface ListEvalResultsParams extends ListQueryParams {
  evalRunId: string;
  passed?: boolean;
}

// ============================================================
// 7. 评测报告（聚合查询）
// ============================================================

export interface EvalRunSummary {
  id: string;
  status: EvalRunStatus;
  agent: {
    id: string;
    name: string;
  };
  testSuite: {
    id: string;
    name: string;
    totalCases: number;
  };
  progress: number;
  passedCount: number;
  failedCount: number;
  averageScore?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
}

export interface EvalRunDetailReport {
  run: EvalRun;
  summary: {
    totalCases: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    averageScore: number;
    dimensionScores: Record<string, number>;
  };
  skillsAnalysis?: {
    [skillName: string]: {
      totalCalls: number;
      successRate: number;
      averageLatency?: number;
    };
  };
  results: EvalResult[];
}

// Agent 统计
export interface AgentStats {
  agentId: string;
  agentName: string;
  totalRuns: number;
  averageScore?: number;
  lastRunAt?: Date;
}

// ============================================================
// 8. 错误响应
// ============================================================

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// 常见错误代码
export enum ErrorCode {
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  TEST_SUITE_NOT_FOUND = 'TEST_SUITE_NOT_FOUND',
  EVAL_RUN_NOT_FOUND = 'EVAL_RUN_NOT_FOUND',
  MODEL_CONFIG_NOT_FOUND = 'MODEL_CONFIG_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  EVAL_RUN_NOT_CANCELLABLE = 'EVAL_RUN_NOT_CANCELLABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ============================================================
// 9. WebSocket 消息类型
// ============================================================

export interface WebSocketMessage {
  type: 'eval_progress' | 'eval_completed' | 'eval_failed' | 'error';
  data: any;
}

export interface EvalProgressMessage extends WebSocketMessage {
  type: 'eval_progress';
  data: EvalRunProgress;
}

export interface EvalCompletedMessage extends WebSocketMessage {
  type: 'eval_completed';
  data: {
    evalRunId: string;
    summary: EvalRunSummary;
  };
}

export interface EvalFailedMessage extends WebSocketMessage {
  type: 'eval_failed';
  data: {
    evalRunId: string;
    errorMessage: string;
  };
}

// ============================================================
// 10. 导出格式
// ============================================================

export interface ExportOptions {
  format: 'json' | 'csv' | 'pdf';
  includeDetails?: boolean;
}

export interface ExportedData {
  format: string;
  data: string | Buffer;
  filename: string;
  mimeType: string;
}
