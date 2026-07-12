import { randomUUID } from "crypto";
import { TradePrint } from "../../types/domain";
import { TradeRepository } from "../TradeRepository";
import { PersistedTrade, RepositoryFlushResult } from "../types";

const DEFAULT_LIMIT = 500;

export class MemoryTradeRepository implements TradeRepository {
  private readonly bySymbol = new Map<string, PersistedTrade[]>();

  save(trade: TradePrint): void {
    const symbol = trade.instrument.symbol.toUpperCase();
    const list = this.bySymbol.get(symbol) ?? [];
    list.push({
      ...trade,
      id: randomUUID(),
      persistedAt: new Date().toISOString(),
    });
    this.bySymbol.set(symbol, list);
  }

  get(symbol: string, limit = DEFAULT_LIMIT): PersistedTrade[] {
    const list = this.bySymbol.get(symbol.toUpperCase()) ?? [];
    return list.slice(-limit);
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
