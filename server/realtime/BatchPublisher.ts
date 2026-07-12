import { MarketData } from "../types/market";
import { HubStats } from "./types";

export type BatchFlushCallback = (updates: MarketData[], sequence: number) => void;

/**
 * Coalesces per-symbol updates over a fixed time window (~50ms).
 *
 * OPTIMIZATION: reuses flushBuffer array — clears length instead of reallocating.
 * enqueue() is O(1) and never blocks.
 */
export class BatchPublisher {
  private readonly pending = new Map<string, MarketData>();
  /** Reused buffer for flush output — avoids Array.from allocation each tick. */
  private readonly flushBuffer: MarketData[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private coalescedCount = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly onFlush: BatchFlushCallback,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    this.flushBuffer.length = 0;
  }

  enqueue(update: MarketData): void {
    const symbol = update.symbol.toUpperCase();
    if (this.pending.has(symbol)) {
      this.coalescedCount += 1;
    }
    this.pending.set(symbol, update);
  }

  flush(): void {
    if (this.pending.size === 0) return;

    // OPTIMIZATION: reuse flushBuffer instead of Array.from(this.pending.values()).
    this.flushBuffer.length = 0;
    for (const update of this.pending.values()) {
      this.flushBuffer.push(update);
    }
    this.pending.clear();
    this.sequence += 1;
    this.onFlush(this.flushBuffer, this.sequence);
  }

  getCoalescedCount(): number {
    return this.coalescedCount;
  }

  getSequence(): number {
    return this.sequence;
  }

  getPendingSize(): number {
    return this.pending.size;
  }
}

export function createHubStats(
  totalClients: number,
  totalSubscriptions: number,
  batchesPublished: number,
  updatesCoalesced: number,
): HubStats {
  return { totalClients, totalSubscriptions, batchesPublished, updatesCoalesced };
}
