/**
 * ScannerConfig — the user's persisted scanner preferences.
 *
 * Stored as a single JSON document (or in-memory), loaded at startup, saved on change.
 * Covers: universe, selected indicators, column thresholds, sort order, filter conditions.
 */

export type IndicatorId =
  | "rvol"
  | "adr"
  | "atr"
  | "vwap"
  | "regime"
  | "score"
  | "grade"
  | "delta"
  | "vah"
  | "val"
  | "poc"
  | "pctChange"
  | "netChange"
  | "signals";

export type SortDirection = "asc" | "desc";
export type FilterOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "in";

export interface FilterCondition {
  /** Indicator to filter on */
  indicator: IndicatorId | "symbol" | "category";
  operator: FilterOperator;
  /** Numeric threshold or string value */
  value: number | string | string[];
}

export interface SortConfig {
  indicator: IndicatorId | "symbol" | "pctChange" | "netChange";
  direction: SortDirection;
}

export interface ScannerConfig {
  /** Version for forward-compatible migration */
  version: number;
  /** Symbols to include in the scan universe */
  universe: string[];
  /** Which indicator columns the user wants visible */
  selectedIndicators: IndicatorId[];
  /** Active filter conditions applied to the grid */
  filters: FilterCondition[];
  /** Current sort order */
  sort: SortConfig;
  updatedAt: string;
}

export const SCANNER_CONFIG_VERSION = 1;

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  version: SCANNER_CONFIG_VERSION,
  universe: [], // empty = use all tracked symbols
  selectedIndicators: ["rvol", "adr", "atr", "regime", "score", "grade", "vwap", "delta"],
  filters: [],
  sort: { indicator: "score", direction: "desc" },
  updatedAt: new Date().toISOString(),
};

/** All indicators with display metadata for the UI column picker */
export const INDICATOR_REGISTRY: Record<
  IndicatorId,
  { label: string; description: string; numeric: boolean; defaultVisible: boolean }
> = {
  rvol: {
    label: "RVol",
    description: "Relative Volume — current session volume vs. historical average",
    numeric: true,
    defaultVisible: true,
  },
  adr: {
    label: "ADR%",
    description: "Average Daily Range filled percent — how much of the typical daily range has been consumed",
    numeric: true,
    defaultVisible: true,
  },
  atr: {
    label: "ATR",
    description: "Average True Range — 14/20 day smoothed volatility measure",
    numeric: true,
    defaultVisible: true,
  },
  vwap: {
    label: "VWAP",
    description: "Volume Weighted Average Price for the current session",
    numeric: true,
    defaultVisible: true,
  },
  regime: {
    label: "Regime",
    description: "Market structure regime: Trending Up/Down, Range-Bound, or Choppy",
    numeric: false,
    defaultVisible: true,
  },
  score: {
    label: "Score",
    description: "Composite opportunity score (0–100) combining all active indicators",
    numeric: true,
    defaultVisible: true,
  },
  grade: {
    label: "Grade",
    description: "Letter grade (A+/A/B/C/F) mapped from the score",
    numeric: false,
    defaultVisible: true,
  },
  delta: {
    label: "Δ Delta",
    description: "Cumulative delta — net buy vs. sell volume pressure",
    numeric: true,
    defaultVisible: false,
  },
  vah: {
    label: "VAH",
    description: "Value Area High — upper boundary of the 70% volume acceptance zone",
    numeric: true,
    defaultVisible: false,
  },
  val: {
    label: "VAL",
    description: "Value Area Low — lower boundary of the 70% volume acceptance zone",
    numeric: true,
    defaultVisible: false,
  },
  poc: {
    label: "POC",
    description: "Point of Control — price level with the highest traded volume",
    numeric: true,
    defaultVisible: false,
  },
  pctChange: {
    label: "%Change",
    description: "Percent change from previous close",
    numeric: true,
    defaultVisible: true,
  },
  netChange: {
    label: "Net Chg",
    description: "Absolute price change from previous close",
    numeric: true,
    defaultVisible: false,
  },
  signals: {
    label: "Signals",
    description: "Active rule-based scanner signals for this instrument",
    numeric: false,
    defaultVisible: false,
  },
};
