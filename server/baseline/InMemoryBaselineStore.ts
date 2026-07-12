import { Logger } from "../logging";
import { BaselineStore } from "./BaselineStore";
import { SymbolBaselineRecord } from "./types";

/**
 * In-memory baseline store — base implementation for JSON/Redis/PostgreSQL adapters.
 */
export class InMemoryBaselineStore implements BaselineStore {
  protected readonly records = new Map<string, SymbolBaselineRecord>();

  constructor(protected readonly logger: Logger) {}

  async load(): Promise<void> {
    this.logger.debug("In-memory baseline store loaded", { count: this.records.size });
  }

  async save(): Promise<void> {
    this.logger.debug("In-memory baseline store saved", { count: this.records.size });
  }

  get(symbol: string): SymbolBaselineRecord | undefined {
    return this.records.get(symbol.toUpperCase());
  }

  set(symbol: string, record: SymbolBaselineRecord): void {
    this.records.set(symbol.toUpperCase(), { ...record, symbol: symbol.toUpperCase() });
  }

  refresh(): void {
    const now = new Date().toISOString();

    for (const [symbol, record] of this.records) {
      const stats = record.sessionStatistics;
      if (stats.sessionsObserved <= 0) continue;

      record.averageDailyVolume = stats.averageSessionVolume;
      record.adr14Day = Math.max(
        record.adr14Day * 0.9 + (stats.averageSessionHigh - stats.averageSessionLow) * 0.1,
        record.adr14Day * 0.5,
      );
      record.updatedAt = now;
      this.records.set(symbol, record);
    }

    this.logger.info("Baseline store refreshed from session statistics", {
      symbols: this.records.size,
    });
  }

  symbols(): string[] {
    return Array.from(this.records.keys());
  }

  size(): number {
    return this.records.size;
  }

  /** Bulk seed without external fetch. */
  seed(records: SymbolBaselineRecord[]): void {
    for (const record of records) {
      this.set(record.symbol, record);
    }
  }
}
