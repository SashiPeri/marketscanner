import { InstrumentIdentity, MarketSnapshot, ScannerSignal } from "../types/domain";
import { MarketData } from "../types/market";

export const TRADE_JOURNAL_SCHEMA_VERSION = 1;

export type TradeSide = "LONG" | "SHORT";

/** Core completed-trade fields required by the journal. */
export interface TradeCore {
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  size: number;
  /** Absolute PnL in price × size units (signed: profit positive). */
  pnl: number;
  /** Trade duration in milliseconds. */
  durationMs: number;
  entryTime: string;
  exitTime: string;
  account?: string;
  notes?: string;
  tags?: string[];
  /** Optional link to Sierra / broker fill ids. */
  entryFillId?: string;
  exitFillId?: string;
}

/** Volume-profile slice captured at exit (or entry if exit state missing). */
export interface VolumeProfileSnapshot {
  pointOfControl?: number;
  valueAreaHigh?: number;
  valueAreaLow?: number;
  profileTotalVolume?: number;
}

/**
 * Scanner metrics frozen at journal write time.
 * Shape is stable for future AI analysis — prefer additive fields only.
 */
export interface ScannerStateSnapshot {
  capturedAt: string;
  vwap?: number;
  distanceFromVwap?: number;
  cumulativeDelta?: number;
  relativeVolume?: number;
  volumeProfile: VolumeProfileSnapshot;
  regime?: string;
  subRegime?: string;
  score?: number;
  grade?: string;
  confidence?: number;
  atr?: number;
  adrFilledPercent?: number;
  trendStrength?: number;
  signalStrength?: number;
  volatilityClass?: string;
  rationale?: string;
  signals: ScannerSignal[];
}

/**
 * Full market context at capture time — tape snapshot + REST MarketData row.
 * Designed so an AI layer can reason without replaying the feed.
 */
export interface MarketContextSnapshot {
  capturedAt: string;
  instrument?: InstrumentIdentity;
  snapshot?: MarketSnapshot;
  marketData?: MarketData;
  sessionHigh?: number;
  sessionLow?: number;
  sessionOpen?: number;
  lastPrice?: number;
  bidPrice?: number;
  askPrice?: number;
  sessionVolume?: number;
}

/**
 * Reserved envelope for future AI analysis pipelines.
 * Do not put model I/O here yet — only structured hooks.
 */
export interface TradeJournalAiContext {
  analysisStatus: "pending" | "analyzed" | "skipped";
  /** Stable feature bag for model input (numbers/strings only). */
  features: Record<string, number | string | boolean | null>;
  /** Human/AI-readable one-liner built at record time. */
  summaryText: string;
  tags: string[];
  /** Filled by a future AI service — leave null until then. */
  analysis?: {
    model?: string;
    analyzedAt?: string;
    narrative?: string;
    labels?: string[];
  } | null;
}

export interface TradeJournalEntry {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  trade: TradeCore;
  scanner: ScannerStateSnapshot;
  market: MarketContextSnapshot;
  ai: TradeJournalAiContext;
}

/** Request body for POST /api/journal/trades */
export interface RecordTradeRequest {
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  size: number;
  /** Optional — computed from entry/exit/size/side when omitted. */
  pnl?: number;
  entryTime: string;
  exitTime: string;
  account?: string;
  notes?: string;
  tags?: string[];
  entryFillId?: string;
  exitFillId?: string;
  /**
   * When true (default), attach live ScannerEngine + MarketCache state.
   * When false, store empty scanner/market shells (still valid schema).
   */
  captureScannerState?: boolean;
}

export interface TradeJournalQuery {
  symbol?: string;
  side?: TradeSide;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface TradeJournalSummary {
  count: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  avgPnl: number;
  avgDurationMs: number;
  bySymbol: Record<string, { count: number; totalPnl: number }>;
  schemaVersion: number;
}
