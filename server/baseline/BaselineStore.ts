import { SymbolBaselineRecord } from "./types";

/**
 * Provider-agnostic baseline storage.
 * Implementations may use JSON, PostgreSQL, or Redis without changing consumers.
 */
export interface BaselineStore {
  /** Load persisted baselines into memory. */
  load(): Promise<void>;

  /** Persist current baselines to durable storage. */
  save(): Promise<void>;

  /** Retrieve baseline for a symbol (undefined if not seeded). */
  get(symbol: string): SymbolBaselineRecord | undefined;

  /** Upsert baseline for a symbol. */
  set(symbol: string, record: SymbolBaselineRecord): void;

  /**
   * Refresh baselines from accumulated session statistics.
   * Does not fetch external data — updates rolling averages in-place.
   */
  refresh(): void;

  /** All symbols with stored baselines. */
  symbols(): string[];

  /** Number of stored baselines. */
  size(): number;
}
