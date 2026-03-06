import type { AgentEvalOptions, TraceOptions, ScoreOptions } from './types';
import { BatchTransport } from './transport';
import { TraceContext } from './trace';

/** 全局默认 client 实例 */
let defaultClient: AgentEval | null = null;

/**
 * AgentEval — TypeScript SDK 主入口。
 *
 * 用法：
 * ```ts
 * const ae = new AgentEval({ baseUrl: 'http://localhost:8000', apiKey: 'xxx' });
 *
 * // 方式1: 手动管理 Trace
 * const trace = ae.trace({ name: 'chat' });
 * trace.setInput(query);
 * const result = await myAgent(query);
 * trace.setOutput(result);
 * trace.score('quality', 0.9);
 * await trace.end();
 *
 * // 方式2: wrap 自动管理
 * const result = await ae.trace({ name: 'chat' }).wrap(async (trace) => {
 *   trace.setInput(query);
 *   const res = await myAgent(query);
 *   trace.setOutput(res);
 *   trace.score('quality', 0.9);
 *   return res;
 * });
 *
 * // 方式3: observe 装饰器
 * const observed = ae.observe('handleQuery', 'chain', async (query: string) => {
 *   return myAgent(query);
 * });
 * await observed('hello');
 * ```
 */
export class AgentEval {
  private transport: BatchTransport;
  private agentId?: string;

  constructor(options: AgentEvalOptions = {}) {
    const baseUrl = options.baseUrl || 'http://localhost:8000';
    const apiKey = options.apiKey || '';

    this.agentId = options.agentId;
    this.transport = new BatchTransport(
      baseUrl,
      apiKey,
      options.flushInterval || 5000,
      options.maxBatchSize || 100,
    );

    // 默认设为全局 client
    defaultClient = this;
  }

  /** 创建 Trace 上下文 */
  trace(options?: TraceOptions | string): TraceContext {
    const opts = typeof options === 'string'
      ? { name: options }
      : { name: 'default', ...options };
    return new TraceContext(this, opts);
  }

  /**
   * 直接上报 Score（不在 Trace 上下文中时使用）。
   * Score 立即发送，不走批量缓冲。
   */
  async score(options: ScoreOptions): Promise<void> {
    await this.transport.sendScore(options);
  }

  /**
   * observe 高阶函数 — 自动创建 Trace 并记录输入/输出/错误。
   *
   * ```ts
   * const observedFn = ae.observe('myFunc', 'chain', async (input: string) => {
   *   return await myAgent(input);
   * });
   * const result = await observedFn('hello');
   * ```
   */
  observe<TArgs extends unknown[], TReturn>(
    name: string,
    kind: string = 'chain',
    fn: (...args: TArgs) => Promise<TReturn>,
  ): (...args: TArgs) => Promise<TReturn> {
    const client = this;
    return async function (...args: TArgs): Promise<TReturn> {
      const trace = client.trace({ name });
      const span = trace.span({ name, kind: kind as 'chain' });

      const inputStr = args.length === 1
        ? (typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]))
        : JSON.stringify(args);
      span.setInput(inputStr);

      try {
        const result = await fn(...args);
        const outputStr = typeof result === 'string' ? result : JSON.stringify(result);
        span.setOutput(outputStr);
        trace.setInput(inputStr);
        trace.setOutput(outputStr);
        span.end();
        await trace.end();
        return result;
      } catch (err) {
        span.setStatus('error', err instanceof Error ? err.message : String(err));
        span.end();
        trace.setStatus('error');
        await trace.end();
        throw err;
      }
    };
  }

  /** 手动 flush 缓冲区 */
  async flush(): Promise<void> {
    await this.transport.flush();
  }

  /** 关闭 SDK */
  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }
}

/** 获取全局默认 client */
export function getDefaultClient(): AgentEval | null {
  return defaultClient;
}

/** 设置全局默认 client */
export function setDefaultClient(client: AgentEval): void {
  defaultClient = client;
}
