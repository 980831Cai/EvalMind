import { randomUUID } from 'crypto';
import type {
  SpanOptions,
  SpanKind,
  TokenUsage,
  SpanEvent,
  TraceEvent,
  SpanEventData,
  ScoreOptions,
  ToolInfo,
} from './types';
import type { AgentEval } from './client';

/**
 * SpanContext — 表示 Trace 中的一个操作步骤。
 * 支持链式调用和 try-finally 模式。
 */
export class SpanContext {
  readonly spanId: string;
  private trace: TraceContext;
  private name: string;
  private kind: SpanKind;
  private parentSpanId?: string;
  private startTime: Date;
  private endTime?: Date;
  private status: string = 'ok';
  private statusMessage?: string;
  private input?: string;
  private output?: string;
  private attributes: Record<string, unknown> = {};
  private events: SpanEvent[] = [];
  // LLM
  private llmModel?: string;
  private llmPromptTokens?: number;
  private llmCompletionTokens?: number;
  private llmTemperature?: number;
  private llmCost?: number;
  // Tool
  private toolName?: string;
  private toolInput?: string;
  private toolOutput?: string;
  private toolStatus?: string;

  constructor(trace: TraceContext, options: SpanOptions) {
    this.spanId = randomUUID();
    this.trace = trace;
    this.name = options.name;
    this.kind = options.kind || 'other';
    this.parentSpanId = options.parentSpanId;
    this.startTime = new Date();
  }

  setInput(value: unknown): this {
    this.input = typeof value === 'string' ? value : JSON.stringify(value);
    return this;
  }

  setOutput(value: unknown): this {
    this.output = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.output && this.output.length > 5000) {
      this.output = this.output.substring(0, 5000) + '...[truncated]';
    }
    return this;
  }

  setModel(model: string): this {
    this.llmModel = model;
    return this;
  }

  setTokenUsage(usage: TokenUsage): this {
    this.llmPromptTokens = usage.promptTokens;
    this.llmCompletionTokens = usage.completionTokens;
    return this;
  }

  setTemperature(temp: number): this {
    this.llmTemperature = temp;
    return this;
  }

  setCost(cost: number): this {
    this.llmCost = cost;
    return this;
  }

  setTool(tool: ToolInfo): this {
    this.toolName = tool.name;
    this.toolInput = tool.input;
    this.toolOutput = tool.output;
    this.toolStatus = tool.status || 'success';
    return this;
  }

  setStatus(status: string, message?: string): this {
    this.status = status;
    this.statusMessage = message;
    return this;
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
    return this;
  }

  /** 结束 Span 并注册到 Trace */
  end(): void {
    this.endTime = new Date();
    this.trace['_addSpan'](this);
  }

  /** 在回调中执行操作，自动管理 Span 生命周期 */
  async wrap<T>(fn: (span: SpanContext) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this);
      this.end();
      return result;
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err));
      this.end();
      throw err;
    }
  }

  /** 同步版本的 wrap */
  wrapSync<T>(fn: (span: SpanContext) => T): T {
    try {
      const result = fn(this);
      this.end();
      return result;
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err));
      this.end();
      throw err;
    }
  }

  /** 序列化为传输格式 */
  _toEventData(): SpanEventData {
    const latencyMs = this.endTime
      ? this.endTime.getTime() - this.startTime.getTime()
      : undefined;

    const data: SpanEventData['data'] = {
      span_id: this.spanId,
      trace_id: this.trace.traceId,
      name: this.name,
      kind: this.kind,
      status: this.status,
      start_time: this.startTime.toISOString(),
      end_time: this.endTime?.toISOString(),
      latency_ms: latencyMs,
      input: this.input,
      output: this.output,
      parent_span_id: this.parentSpanId,
      attributes: Object.keys(this.attributes).length > 0 ? this.attributes : undefined,
      events: this.events.length > 0 ? this.events : undefined,
      status_message: this.statusMessage,
    };

    // LLM 字段
    if (this.llmModel) data.llm_model = this.llmModel;
    if (this.llmPromptTokens != null) data.llm_prompt_tokens = this.llmPromptTokens;
    if (this.llmCompletionTokens != null) data.llm_completion_tokens = this.llmCompletionTokens;
    if (this.llmTemperature != null) data.llm_temperature = this.llmTemperature;
    if (this.llmCost != null) data.llm_cost = this.llmCost;

    // Tool 字段
    if (this.toolName) data.tool_name = this.toolName;
    if (this.toolInput) data.tool_input = this.toolInput;
    if (this.toolOutput) data.tool_output = this.toolOutput;
    if (this.toolStatus) data.tool_status = this.toolStatus;

    return { type: 'span', data };
  }
}


/**
 * TraceContext — 表示一次完整的追踪。
 * 支持链式调用和 try-finally 模式。
 */
export class TraceContext {
  readonly traceId: string;
  private client: AgentEval;
  private name: string;
  private sessionId?: string;
  private userId?: string;
  private metadata: Record<string, unknown>;
  private tags: string[];
  private startTime: Date;
  private endTime?: Date;
  private status: string = 'ok';
  private input?: string;
  private output?: string;
  private spans: SpanContext[] = [];
  private scores: Array<Omit<ScoreOptions, 'traceId'>> = [];

  constructor(client: AgentEval, options: {
    name: string;
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }) {
    this.traceId = randomUUID();
    this.client = client;
    this.name = options.name;
    this.sessionId = options.sessionId;
    this.userId = options.userId;
    this.metadata = options.metadata || {};
    this.tags = options.tags || [];
    this.startTime = new Date();
  }

  setInput(value: unknown): this {
    this.input = typeof value === 'string' ? value : JSON.stringify(value);
    return this;
  }

  setOutput(value: unknown): this {
    this.output = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.output && this.output.length > 5000) {
      this.output = this.output.substring(0, 5000) + '...[truncated]';
    }
    return this;
  }

  setStatus(status: string): this {
    this.status = status;
    return this;
  }

  setMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  addTag(tag: string): this {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
    return this;
  }

  /** 创建子 Span */
  span(options: SpanOptions | string): SpanContext {
    const opts = typeof options === 'string' ? { name: options } : options;
    return new SpanContext(this, opts);
  }

  /** 在 Trace 上下文中记录 Score（Trace 结束时批量发送） */
  score(name: string, value?: number, options?: { stringValue?: string; comment?: string }): this {
    this.scores.push({
      name,
      value,
      stringValue: options?.stringValue,
      comment: options?.comment,
    });
    return this;
  }

  /** 结束 Trace 并发送所有数据 */
  async end(): Promise<void> {
    this.endTime = new Date();
    await this._flush();
  }

  /** 在回调中执行操作，自动管理 Trace 生命周期 */
  async wrap<T>(fn: (trace: TraceContext) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this);
      await this.end();
      return result;
    } catch (err) {
      this.setStatus('error');
      await this.end();
      throw err;
    }
  }

  /** 内部方法：添加已结束的 Span */
  private _addSpan(span: SpanContext): void {
    this.spans.push(span);
  }

  /** 内部方法：Flush 所有数据到传输层 */
  private async _flush(): Promise<void> {
    const transport = this.client['transport'];
    if (!transport) return;

    // 统计聚合
    let llmCallCount = 0;
    let toolCallCount = 0;
    let totalTokens = 0;

    for (const span of this.spans) {
      const eventData = span._toEventData();
      const d = eventData.data;
      if (d.kind === 'llm') llmCallCount++;
      if (d.kind === 'tool') toolCallCount++;
      if (d.llm_prompt_tokens) totalTokens += d.llm_prompt_tokens;
      if (d.llm_completion_tokens) totalTokens += d.llm_completion_tokens;
    }

    const latencyMs = this.endTime
      ? this.endTime.getTime() - this.startTime.getTime()
      : undefined;

    // 发送 Trace 事件
    const traceEvent: TraceEvent = {
      type: 'trace',
      data: {
        trace_id: this.traceId,
        agent_id: this.client['agentId'],
        name: this.name,
        status: this.status,
        start_time: this.startTime.toISOString(),
        end_time: this.endTime?.toISOString(),
        latency_ms: latencyMs,
        input: this.input,
        output: this.output,
        session_id: this.sessionId,
        user_id: this.userId,
        metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
        tags: this.tags.length > 0 ? this.tags : undefined,
        source: 'sdk',
        llm_call_count: llmCallCount,
        tool_call_count: toolCallCount,
        total_tokens: totalTokens,
      },
    };

    transport.enqueue(traceEvent);

    // 发送 Span 事件
    for (const span of this.spans) {
      transport.enqueue(span._toEventData());
    }

    // 发送 Score
    for (const s of this.scores) {
      await transport.sendScore({
        traceId: this.traceId,
        name: s.name,
        value: s.value,
        stringValue: s.stringValue,
        comment: s.comment,
        source: 'sdk',
      });
    }
  }
}
