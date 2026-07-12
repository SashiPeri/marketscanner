/** Number of 15-minute intraday buckets in a full session (6.5h RTH). */
export const INTRADAY_CURVE_BUCKETS = 26;

/** Rolling lookback for ADR baseline. */
export const ADR_LOOKBACK_DAYS = 14;

/** Rolling lookback for ATR baseline. */
export const ATR_LOOKBACK_DAYS = 20;

/** Rolling lookback for average daily volume. */
export const ADV_LOOKBACK_DAYS = 20;

/**
 * Aggregated session statistics used to refresh baselines over time.
 * Distinct from domain SessionStatistics — scoped to baseline storage.
 */
export interface BaselineSessionStats {
  averageSessionVolume: number;
  averageSessionHigh: number;
  averageSessionLow: number;
  averageOpeningRange: number;
  sessionsObserved: number;
  lastUpdatedAt: string;
}

/**
 * Provider-agnostic historical baseline for a single symbol.
 * Designed for JSON persistence today; PostgreSQL/Redis tomorrow.
 */
export interface SymbolBaselineRecord {
  symbol: string;
  name?: string;
  category?: "FUTURES" | "FOREX" | "CRYPTO" | "EQUITIES";
  /** Average daily volume over ADV_LOOKBACK_DAYS. */
  averageDailyVolume: number;
  /** Fraction of daily volume at each intraday bucket (sums to ~1). */
  intradayVolumeCurve: number[];
  /** 14-day average daily range. */
  adr14Day: number;
  /** 20-day average true range. */
  atr20Day: number;
  previousClose?: number;
  sessionStatistics: BaselineSessionStats;
  updatedAt: string;
}

export interface BaselineStoreSnapshot {
  version: number;
  updatedAt: string;
  symbols: Record<string, SymbolBaselineRecord>;
}
