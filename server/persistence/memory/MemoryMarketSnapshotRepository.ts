import { randomUUID } from "crypto";
import { MarketSnapshot } from "../../types/domain";
import { MarketSnapshotRepository } from "../MarketSnapshotRepository";
import { PersistedMarketSnapshot, RepositoryFlushResult } from "../types";

const DEFAULT_LIMIT = 100;

export class MemoryMarketSnapshotRepository implements MarketSnapshotRepository {
  private readonly bySymbol = new Map<string, PersistedMarketSnapshot[]>();

  save(snapshot: MarketSnapshot): void {
    const symbol = snapshot.instrument.symbol.toUpperCase();
    const list = this.bySymbol.get(symbol) ?? [];
    list.push({
      ...snapshot,
      id: randomUUID(),
      persistedAt: new Date().toISOString(),
    });
    this.bySymbol.set(symbol, list);
  }

  get(symbol: string, limit = DEFAULT_LIMIT): PersistedMarketSnapshot[] {
    const list = this.bySymbol.get(symbol.toUpperCase()) ?? [];
    return list.slice(-limit);
  }

  getLatest(symbol: string): PersistedMarketSnapshot | undefined {
    const list = this.bySymbol.get(symbol.toUpperCase());
    return list?.[list.length - 1];
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    return { flushed: this.size(), durationMs: Date.now() - start };
  }

  size(): number {
    let total = 0;
    for (const list of this.bySymbol.values()) total += list.length;
    return total;
  }

  symbols(): string[] {
    return Array.from(this.bySymbol.keys());
  }
}
