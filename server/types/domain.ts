/**
 * Provider-agnostic identity for a tradable instrument.
 * The same contract can describe futures, equities, FX, crypto, or options
 * without leaking any provider-specific symbol format into downstream code.
 */
export interface InstrumentIdentity {
  /** Canonical application symbol used internally by scanner services and UI contracts. */
  symbol: string;
  /** Human-readable instrument name for display and logs. */
  name?: string;
  /** Broad asset class used for grouping, filtering, and scanner policy decisions. */
  assetClass: "FUTURES" | "EQUITIES" | "FOREX" | "CRYPTO" | "OPTIONS" | "FIXED_INCOME" | "UNKNOWN";
  /** Exchange or venue code when available, such as CME, NYSE, NASDAQ, or BINANCE. */
  venue?: string;
  /** Provider-native symbol, retained only for traceability and diagnostics. */
  providerSymbol?: string;
  /** Minimum price increment for the instrument, when known. */
  tickSize?: number;
  /** Monetary value of one tick movement, when known. */
  tickValue?: number;
  /** Contract multiplier for derivatives or unit multiplier for normalized notional calculations. */
  multiplier?: number;
  /** Quote currency for prices, PnL, and notional values when applicable. */
  currency?: string;
}

/**
 * Latest normalized top-level market state for one instrument.
 * This is the primary data object consumed by scanner calculations.
 */
export interface MarketSnapshot {
  /** Instrument represented by this snapshot. */
  instrument: InstrumentIdentity;
  /** Last traded price, normalized to a plain number. */
  lastPrice: number;
  /** Best bid price currently known, if the provider publishes it. */
  bidPrice?: number;
  /** Best ask price currently known, if the provider publishes it. */
  askPrice?: number;
  /** Size resting at the current best bid, if available. */
  bidSize?: number;
  /** Size resting at the current best ask, if available. */
  askSize?: number;
  /** Opening price for the active session. */
  open?: number;
  /** Highest traded price for the active session. */
  high?: number;
  /** Lowest traded price for the active session. */
  low?: number;
  /** Previous settlement or close used as the reference price. */
  previousClose?: number;
  /** Absolute change from the reference price. */
  netChange?: number;
  /** Percent change from the reference price. */
  percentChange?: number;
  /** Cumulative volume for the active session. */
  sessionVolume?: number;
  /** Provider event timestamp, expressed as an ISO-8601 string when available. */
  providerTimestamp?: string;
  /** Application receive timestamp, expressed as an ISO-8601 string. */
  receivedAt: string;
}

/**
 * One visible price level in the order book.
 * Price levels are normalized so downstream consumers do not care which feed
 * produced them.
 */
export interface OrderBookLevel {
  /** Price at this depth level. */
  price: number;
  /** Aggregate resting size at this level. */
  size: number;
  /** Number of orders represented at this level, when the feed exposes it. */
  orderCount?: number;
}

/**
 * Normalized depth-of-market snapshot for one instrument.
 * This should represent the latest coherent book view, not a protocol packet.
 */
export interface OrderBookSnapshot {
  /** Instrument represented by this order book. */
  instrument: InstrumentIdentity;
  /** Bid levels sorted from highest price to lowest price. */
  bids: OrderBookLevel[];
  /** Ask levels sorted from lowest price to highest price. */
  asks: OrderBookLevel[];
  /** Number of depth levels included on each side when known. */
  depth?: number;
  /** Provider sequence number used to detect missed or out-of-order updates. */
  sequence?: number;
  /** Provider event timestamp, expressed as an ISO-8601 string when available. */
  providerTimestamp?: string;
  /** Application receive timestamp, expressed as an ISO-8601 string. */
  receivedAt: string;
}

/**
 * Normalized executed trade print.
 * This is the atomic input for volume, delta, tape, and profile calculations.
 */
export interface TradePrint {
  /** Instrument traded. */
  instrument: InstrumentIdentity;
  /** Trade execution price. */
  price: number;
  /** Executed quantity. */
  size: number;
  /** Aggressor side when the provider or classifier can determine it. */
  aggressorSide?: "BUY" | "SELL" | "UNKNOWN";
  /** Unique provider trade identifier, if available. */
  tradeId?: string;
  /** Provider sequence number used to preserve tape ordering. */
  sequence?: number;
  /** Provider event timestamp, expressed as an ISO-8601 string when available. */
  providerTimestamp?: string;
  /** Application receive timestamp, expressed as an ISO-8601 string. */
  receivedAt: string;
}

/**
 * One row of a normalized volume profile distribution.
 * Scanner calculations can derive POC, value area, and profile shape from these rows.
 */
export interface VolumeProfileLevel {
  /** Price level or price bucket represented by this row. */
  price: number;
  /** Total volume traded at this price level or bucket. */
  volume: number;
  /** Volume classified as buyer-initiated at this price level, when available. */
  buyVolume?: number;
  /** Volume classified as seller-initiated at this price level, when available. */
  sellVolume?: number;
}

/**
 * Normalized volume profile for a defined time/session range.
 * This model stores derived profile state, not the algorithm that created it.
 */
export interface VolumeProfile {
  /** Instrument represented by this profile. */
  instrument: InstrumentIdentity;
  /** Start timestamp of the profile window, expressed as ISO-8601. */
  startTime: string;
  /** End timestamp of the profile window, expressed as ISO-8601. */
  endTime: string;
  /** Price level with the highest traded volume. */
  pointOfControl?: number;
  /** Upper boundary of the selected value area. */
  valueAreaHigh?: number;
  /** Lower boundary of the selected value area. */
  valueAreaLow?: number;
  /** Percent of total profile volume included in the value area, such as 70. */
  valueAreaPercent?: number;
  /** Total volume represented by this profile. */
  totalVolume: number;
  /** Volume distribution by price level or bucket. */
  levels: VolumeProfileLevel[];
  /** Application calculation timestamp, expressed as ISO-8601. */
  calculatedAt: string;
}

/**
 * Session-level market statistics independent of any specific provider.
 * Scanner modules use this as baseline context for current-day calculations.
 */
export interface SessionStatistics {
  /** Instrument represented by these session statistics. */
  instrument: InstrumentIdentity;
  /** Trading session identifier, such as RTH, ETH, or a configured custom session name. */
  sessionId: string;
  /** Session start timestamp, expressed as ISO-8601. */
  sessionStart: string;
  /** Session end timestamp, expressed as ISO-8601 when known. */
  sessionEnd?: string;
  /** Opening price for this session. */
  open?: number;
  /** Highest traded price for this session. */
  high?: number;
  /** Lowest traded price for this session. */
  low?: number;
  /** Last traded price observed in this session. */
  last?: number;
  /** Total volume accumulated during this session. */
  volume?: number;
  /** Volume weighted average price for this session, when calculated. */
  vwap?: number;
  /** Average daily range baseline used by ADR metrics. */
  averageDailyRange?: number;
  /** Average volume baseline for the comparable session/time window. */
  averageVolume?: number;
  /** Cumulative buyer-initiated minus seller-initiated volume, when available. */
  cumulativeDelta?: number;
  /** Application calculation timestamp, expressed as ISO-8601. */
  calculatedAt: string;
}

/**
 * Provider-agnostic scanner metric bundle.
 * These fields are outputs of calculation modules and inputs to scoring/signals.
 */
export interface ScannerMetrics {
  /** Instrument represented by these scanner metrics. */
  instrument: InstrumentIdentity;
  /** Relative volume compared with the configured historical baseline. */
  relativeVolume?: number;
  /** Percent of average daily range consumed by the active session. */
  adrFilledPercent?: number;
  /** Current VWAP value for the configured session/window. */
  vwap?: number;
  /** Distance between last price and VWAP, expressed in price units. */
  distanceFromVwap?: number;
  /** Current cumulative delta value, when classified trade data is available. */
  cumulativeDelta?: number;
  /** Current value area high from the selected volume profile. */
  valueAreaHigh?: number;
  /** Current value area low from the selected volume profile. */
  valueAreaLow?: number;
  /** Current point of control from the selected volume profile. */
  pointOfControl?: number;
  /** Detected market regime used by downstream signal and scoring logic. */
  regime?: "TRENDING_UP" | "TRENDING_DOWN" | "RANGE_BOUND" | "CHOPPY" | "UNKNOWN";
  /** Application calculation timestamp, expressed as ISO-8601. */
  calculatedAt: string;
}

/**
 * Human- and machine-readable trading signal produced by scanner rules.
 * A signal explains what condition was detected without placing trades.
 */
export interface ScannerSignal {
  /** Stable signal identifier for deduplication and alert tracking. */
  id: string;
  /** Instrument represented by this signal. */
  instrument: InstrumentIdentity;
  /** Directional interpretation of the signal. */
  direction: "LONG" | "SHORT" | "NEUTRAL";
  /** Signal category used for filtering and alert routing. */
  type: "BREAKOUT" | "PULLBACK" | "MEAN_REVERSION" | "EXHAUSTION" | "AVOID" | "INFO";
  /** Severity or importance assigned by scanner logic. */
  severity: "LOW" | "MEDIUM" | "HIGH";
  /** Short display title for the signal. */
  title: string;
  /** Plain-language explanation of why the signal fired. */
  rationale: string;
  /** Optional reference price associated with the setup. */
  referencePrice?: number;
  /** Timestamp when the signal was generated, expressed as ISO-8601. */
  generatedAt: string;
}

/**
 * Final normalized scanner output for one instrument.
 * This is the object an API, WebSocket broadcaster, AI explainer, or UI can consume.
 */
export interface ScannerResult {
  /** Instrument represented by this scanner result. */
  instrument: InstrumentIdentity;
  /** Latest market snapshot used by the scanner. */
  snapshot: MarketSnapshot;
  /** Latest calculated scanner metrics. */
  metrics: ScannerMetrics;
  /** Active signals produced from the latest scanner state. */
  signals: ScannerSignal[];
  /** Composite probability or opportunity score from 0 to 100. */
  score: number;
  /** Human-readable grade mapped from the score and risk rules. */
  grade: "A+" | "A" | "B" | "C" | "F";
  /** Summary explanation suitable for UI display or AI briefing context. */
  rationale: string;
  /** Timestamp when this scanner result was produced, expressed as ISO-8601. */
  calculatedAt: string;
}

/**
 * Provider-agnostic value emitted by an external chart/study system.
 * Sierra Chart custom studies, CQG studies, or an internal research engine can
 * all populate this shape without changing downstream scanner condition logic.
 */
export interface StudyValue {
  /** Stable study identifier, such as vwap-reclaim-study or opening-drive. */
  studyId: string;
  /** Human-readable study name for diagnostics and condition builders. */
  studyName?: string;
  /** Stable subgraph/output identifier within the study, such as SG1 or signal. */
  field: string;
  /** Latest normalized numeric, boolean, or text value emitted by the study. */
  value: number | boolean | string;
  /** Optional provider-native source label for traceability. */
  source?: string;
  /** Provider event timestamp, expressed as an ISO-8601 string when available. */
  providerTimestamp?: string;
  /** Application receive timestamp, expressed as an ISO-8601 string. */
  receivedAt: string;
}

/**
 * Latest normalized external study state for one instrument.
 * This deliberately stores study outputs only; calculation and transport remain
 * in provider adapters or scanner modules.
 */
export interface StudyValueSnapshot {
  /** Instrument represented by these study values. */
  instrument: InstrumentIdentity;
  /** Study values keyed by study/field pairs for condition evaluation. */
  values: StudyValue[];
  /** Application receive timestamp, expressed as an ISO-8601 string. */
  receivedAt: string;
}

/**
 * Normalized connection state for any market data provider.
 * This is intentionally not tied to Sierra so the same contract can describe
 * DTC, CQG, Rithmic, IBKR, replay, or a mock provider.
 */
export interface ConnectionStatus {
  /** Stable provider key, such as sierra-dtc, cqg, rithmic, ibkr, or mock. */
  provider: string;
  /** Current provider connection state. */
  state: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";
  /** Hostname, IP, or endpoint label when safe to expose. */
  endpoint?: string;
  /** Timestamp of the last successful connection, expressed as ISO-8601. */
  connectedAt?: string;
  /** Timestamp of the last received provider message, expressed as ISO-8601. */
  lastMessageAt?: string;
  /** Number of reconnect attempts since the last stable connection. */
  reconnectAttempts: number;
  /** Last connection or protocol error message, if any. */
  lastError?: string;
  /** Application timestamp for this status snapshot, expressed as ISO-8601. */
  updatedAt: string;
}
