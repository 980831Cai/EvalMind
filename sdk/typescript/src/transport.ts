import type { TransportEvent, ScoreOptions } from './types';

/**
 * 批量传输层 — 负责将事件批量发送到平台 API。
 * 支持定时 flush、阈值 flush、指数退避重试。
 */
export class BatchTransport {
  private baseUrl: string;
  private apiKey: string;
  private flushInterval: number;
  private maxBatchSize: number;
  private buffer: TransportEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private isShutdown = false;
  private maxRetries = 3;

  constructor(
    baseUrl: string,
    apiKey: string,
    flushInterval: number = 5000,
    maxBatchSize: number = 100,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.flushInterval = flushInterval;
    this.maxBatchSize = maxBatchSize;

    // 启动定时 flush
    this.timer = setInterval(() => this.flush(), this.flushInterval);

    // Node.js 进程退出前 flush
    if (typeof process !== 'undefined' && process.on) {
      process.on('beforeExit', () => this.shutdown());
    }
  }

  /** 将事件放入缓冲区，达到阈值时自动 flush */
  enqueue(event: TransportEvent): void {
    if (this.isShutdown) return;
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  /** 立即上报 Score（不走批量缓冲） */
  async sendScore(score: ScoreOptions): Promise<void> {
    const payload = {
      trace_id: score.traceId,
      name: score.name,
      value: score.value,
      string_value: score.stringValue,
      comment: score.comment,
      source: score.source || 'sdk',
      span_id: score.spanId,
    };
    try {
      await this.post('/api/scores', payload);
    } catch (err) {
      // 静默处理，不影响业务
      if (typeof console !== 'undefined') {
        console.warn('[agent-eval-sdk] Score send failed:', err);
      }
    }
  }

  /** 手动 flush 缓冲区 */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    await this.sendBatch(batch);
  }

  /** 关闭传输层 */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async sendBatch(events: TransportEvent[]): Promise<void> {
    if (events.length === 0) return;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.post('/api/ingest', { events });
        return;
      } catch (err) {
        if (attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (typeof console !== 'undefined') {
          console.warn('[agent-eval-sdk] Batch send failed after retries:', err);
        }
      }
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    // 支持 Node.js fetch (18+) 和 globalThis.fetch
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }
}
