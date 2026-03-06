/** SDK 配置选项 */
export interface AgentEvalOptions {
  /** 平台 API 地址，默认 http://localhost:8000 */
  baseUrl?: string;
  /** API 密钥 */
  apiKey?: string;
  /** 默认关联的 Agent ID */
  agentId?: string;
  /** 自动 flush 间隔（毫秒），默认 5000 */
  flushInterval?: number;
  /** 批量发送最大条数，默认 100 */
  maxBatchSize?: number;
}

/** Trace 创建选项 */
export interface TraceOptions {
  /** Trace 名称 */
  name?: string;
  /** 会话 ID（用于关联多轮对话） */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
  /** 标签 */
  tags?: string[];
}

/** Span 创建选项 */
export interface SpanOptions {
  /** Span 名称 */
  name: string;
  /** Span 类型 */
  kind?: SpanKind;
  /** 父 Span ID */
  parentSpanId?: string;
}

/** Span 类型 */
export type SpanKind = 'llm' | 'tool' | 'retrieval' | 'agent' | 'chain' | 'other';

/** Token 用量 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Score 上报选项 */
export interface ScoreOptions {
  /** 关联的 Trace ID */
  traceId: string;
  /** 评分维度名称 */
  name: string;
  /** 数值评分 */
  value?: number;
  /** 字符串评分 */
  stringValue?: string;
  /** 评论 */
  comment?: string;
  /** 关联的 Span ID */
  spanId?: string;
  /** 来源，默认 sdk */
  source?: string;
}

/** 工具调用信息 */
export interface ToolInfo {
  name: string;
  input?: string;
  output?: string;
  status?: string;
}

/** 事件记录 */
export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

/** Trace 事件数据（内部传输用） */
export interface TraceEvent {
  type: 'trace';
  data: {
    trace_id: string;
    agent_id?: string;
    name: string;
    status: string;
    start_time: string;
    end_time?: string;
    latency_ms?: number;
    input?: string;
    output?: string;
    session_id?: string;
    user_id?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    source: string;
    llm_call_count: number;
    tool_call_count: number;
    total_tokens: number;
  };
}

/** Span 事件数据（内部传输用） */
export interface SpanEventData {
  type: 'span';
  data: {
    span_id: string;
    trace_id: string;
    name: string;
    kind: string;
    status: string;
    status_message?: string;
    start_time: string;
    end_time?: string;
    latency_ms?: number;
    input?: string;
    output?: string;
    parent_span_id?: string;
    attributes?: Record<string, unknown>;
    events?: SpanEvent[];
    // LLM
    llm_model?: string;
    llm_prompt_tokens?: number;
    llm_completion_tokens?: number;
    llm_temperature?: number;
    llm_cost?: number;
    // Tool
    tool_name?: string;
    tool_input?: string;
    tool_output?: string;
    tool_status?: string;
  };
}

/** 传输层事件 */
export type TransportEvent = TraceEvent | SpanEventData;
