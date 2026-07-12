import {
  InstrumentIdentity,
  MarketSnapshot,
  ScannerMetrics,
  ScannerResult,
  ScannerSignal,
} from "../types/domain";

/** Historical baselines seeded at startup or from BaselineStore. */
export interface SymbolBaseline {
  symbol: string;
  name?: string;
  category?: "FUTURES" | "FOREX" | "CRYPTO" | "EQUITIES";
  averageDailyRange?: number;
  averageSessionVolume?: number;
  previousClose?: number;
  /** 20-day ATR baseline from BaselineStore. */
  averageTrueRange?: number;
  /** Fraction of daily volume per intraday bucket (time-of-day RVol normalization). */
  intradayVolumeCurve?: number[];
}

/** Extended internal metrics beyond the public ScannerMetrics contract. */
export interface ExtendedScannerMetrics extends ScannerMetrics {
  atr?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionOpen?: number;
  openingRangeHigh?: number;
  openingRangeLow?: number;
  openingDrive?: "UP" | "DOWN" | "FLAT";
  vwapReclaim?: boolean;
  vwapRejection?: boolean;
  buyingPressure?: number;
  sellingPressure?: number;
  tradeImbalance?: number;
  bidAggression?: number;
  askAggression?: number;
  trendStrength?: number;
  signalStrength?: number;
  confidence?: number;
  volatilityClass?: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  subRegime?: "TREND" | "BALANCE" | "ROTATION" | "BREAKOUT" | "UNKNOWN";
}

/** Full scored output produced by the scanner engine. */
export interface ScoredScannerResult extends ScannerResult {
  metrics: ExtendedScannerMetrics;
  confidence: number;
  trendStrength: number;
  signalStrength: number;
}

/** Normalized market events consumed by the scanner pipeline. */
export type ScannerEvent =
  | { type: "marketSnapshot"; payload: MarketSnapshot }
  | { type: "tradePrint"; payload: import("../types/domain").TradePrint }
  | { type: "orderBookSnapshot"; payload: import("../types/domain").OrderBookSnapshot };

/** Callback signature for downstream consumers of scanner results. */
export type ScannerResultListener = (result: ScoredScannerResult) => void;

/** Re-export domain types used by external consumers. */
export type { InstrumentIdentity, MarketSnapshot, ScannerMetrics, ScannerResult, ScannerSignal };
