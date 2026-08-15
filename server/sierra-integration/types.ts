import { InstrumentIdentity } from "../types/domain";

/** Physical Sierra access path used by a concrete adapter. */
export type SierraTransportKind =
  | "dtc"
  | "acsil"
  | "trade_activity_log"
  | "historical_files";

/** Integration goals covered by this layer. */
export type SierraIntegrationGoal =
  | "completed_trades"
  | "historical_ticks"
  | "replay_sessions"
  | "chartbook"
  | "executions"
  | "fills"
  | "fill_scanner_correlation";

export interface SourceCapability {
  goal: SierraIntegrationGoal;
  /** Recommended primary transport for this goal. */
  transport: SierraTransportKind;
  /** Optional fallback transport. */
  secondaryTransport?: SierraTransportKind;
  /** Whether a concrete adapter is wired (false for stubs). */
  supported: boolean;
  notes: string;
}

/** Market tape print (completed exchange trade), distinct from account fills. */
export interface CompletedTrade {
  instrument: InstrumentIdentity;
  price: number;
  size: number;
  aggressorSide?: "BUY" | "SELL" | "UNKNOWN";
  tradeId?: string;
  sequence?: number;
  providerTimestamp?: string;
  receivedAt: string;
  sourceTransport?: SierraTransportKind;
}

export interface CompletedTradeQuery {
  symbol: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export type CompletedTradeListener = (trade: CompletedTrade) => void;
export type Unsubscribe = () => void;

export interface HistoricalTick {
  instrument: InstrumentIdentity;
  price: number;
  size?: number;
  bidPrice?: number;
  askPrice?: number;
  providerTimestamp: string;
  sequence?: number;
  sourceTransport?: SierraTransportKind;
}

export interface HistoricalTickQuery {
  symbol: string;
  startTime: string;
  endTime: string;
  /** Prefer tick; adapters may downsample when unsupported. */
  resolution?: "tick" | "second" | "minute";
  limit?: number;
  exchange?: string;
}

export type ReplayPlayState = "idle" | "playing" | "paused" | "stopped" | "unknown";

export interface ReplaySessionDescriptor {
  sessionId: string;
  symbol: string;
  exchange?: string;
  startTime?: string;
  endTime?: string;
  label?: string;
  sourceTransport?: SierraTransportKind;
}

export interface ReplaySessionStatus {
  sessionId: string;
  playState: ReplayPlayState;
  currentTime?: string;
  speed?: number;
  updatedAt: string;
}

export interface ChartDescriptor {
  chartNumber?: number;
  name?: string;
  symbol?: string;
  timeframe?: string;
}

export interface ChartbookInfo {
  id: string;
  name: string;
  path?: string;
  charts: ChartDescriptor[];
  symbols: string[];
  updatedAt?: string;
  sourceTransport?: SierraTransportKind;
}

export type ExecutionSide = "BUY" | "SELL";
export type ExecutionStatus =
  | "WORKING"
  | "FILLED"
  | "PARTIAL"
  | "CANCELED"
  | "REJECTED"
  | "UNKNOWN";

/** Order-level activity (execution / order record). */
export interface ExecutionRecord {
  id: string;
  instrument: InstrumentIdentity;
  side: ExecutionSide;
  quantity: number;
  filledQuantity?: number;
  price?: number;
  averageFillPrice?: number;
  status: ExecutionStatus;
  orderId?: string;
  account?: string;
  providerTimestamp?: string;
  receivedAt: string;
  sourceTransport?: SierraTransportKind;
  rawType?: string;
}

export interface ExecutionQuery {
  symbol?: string;
  account?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export type ImportSource =
  | { kind: "file"; path: string }
  | { kind: "payload"; content: string; format?: "tsv" | "csv" | "json" };

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Account fill (our trade), distinct from market tape. */
export interface FillRecord {
  id: string;
  instrument: InstrumentIdentity;
  side: ExecutionSide;
  price: number;
  quantity: number;
  orderId?: string;
  executionId?: string;
  tradeId?: string;
  account?: string;
  providerTimestamp: string;
  receivedAt: string;
  sourceTransport?: SierraTransportKind;
}

export interface FillQuery {
  symbol?: string;
  account?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export type FillListener = (fill: FillRecord) => void;

export type CorrelationMatchMethod =
  | "trade_id"
  | "time_window"
  | "nearest_snapshot"
  | "live_result"
  | "unmatched";

/** Scanner fields copied at correlation time (no backtest engine). */
export interface CorrelatedScannerSnapshot {
  calculatedAt?: string;
  score?: number;
  grade?: string;
  relativeVolume?: number;
  adrFilledPercent?: number;
  regime?: string;
  vwap?: number;
  cumulativeDelta?: number;
  atr?: number;
}

export interface FillScannerCorrelation {
  fill: FillRecord;
  matched: boolean;
  matchMethod: CorrelationMatchMethod;
  confidence: number;
  scanner?: CorrelatedScannerSnapshot;
  notes?: string;
}

export interface CorrelateOptions {
  /** Half-window in ms for time-based matching. Default adapter-defined. */
  windowMs?: number;
  preferLiveResult?: boolean;
}
