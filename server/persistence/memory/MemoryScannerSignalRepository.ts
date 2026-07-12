import { ScannerSignal } from "../../types/domain";
import { ScannerSignalRepository } from "../ScannerSignalRepository";
import { PersistedScannerSignal, RepositoryFlushResult } from "../types";

const DEFAULT_LIMIT = 200;

export class MemoryScannerSignalRepository implements ScannerSignalRepository {
  private readonly bySymbol = new Map<string, PersistedScannerSignal[]>();

  save(signal: ScannerSignal): void {
    const symbol = signal.instrument.symbol.toUpperCase();
    const list = this.bySymbol.get(symbol) ?? [];
    list.push({
      ...signal,
      persistedAt: new Date().toISOString(),
    });
    this.bySymbol.set(symbol, list);
  }

  get(symbol: string, limit = DEFAULT_LIMIT): PersistedScannerSignal[] {
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
