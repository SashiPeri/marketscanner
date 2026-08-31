import { InstrumentIdentity } from "../types/domain";

export const TRADE_LIFECYCLE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Primitive enumerations
// ---------------------------------------------------------------------------

/** Direction of a fill or order. */
export type FillSide = "BUY" | "SELL";

/** Direction of an open position. */
export type TradePositionSide = "LONG" | "SHORT";

/** Lifecycle state of an open position. */
export type TradePositionStatus = "OPEN" | "CLOSED";

/** Status values an order event may carry. */
export type OrderEventStatus =
  | "WORKING"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELED"
  | "REJECTED"
  | "UNKNOWN";

// ---------------------------------------------------------------------------
// Domain Fill
// ---------------------------------------------------------------------------

/**
 * Normalized account fill in the trade-lifecycle domain.
 *
 * This is NOT the same as `FillRecord` from `server/sierra-integration/types.ts`.
 * `FillRecord` is the raw Sierra acquisition type.
 * `Fill` is the normalized domain primitive that the lifecycle engine operates on.
 * Callers are responsible for mapping `FillRecord → Fill` before submitting to the engine.
 */
export interface Fill {
  /** Stable unique identifier for this fill. */
  id: string;
  /** Instrument this fill belongs to. */
  instrument: InstrumentIdentity;
  /** Direction of the fill. */
  side: FillSide;
  /** Execution price. */
  price: number;
  /** Number of units/contracts filled. Must be a positive finite number. */
  quantity: number;
  /** Brokerage account identifier. */
  account: string;
  /** Provider/broker order identifier, if available. */
  orderId?: string;
  /** Provider/broker execution identifier, if available. */
  executionId?: string;
  /** Provider timestamp for the fill event (ISO-8601). */
  providerTimestamp: string;
  /** Application receive timestamp (ISO-8601). */
  receivedAt: string;
  /** Per-fill commission charged by the broker (positive = cost). */
  commission?: number;
  /** Per-fill exchange/regulatory fees (positive = cost). */
  fees?: number;
}

// ---------------------------------------------------------------------------
// Order Event
// ---------------------------------------------------------------------------

/**
 * An order-lifecycle event captured for audit purposes.
 *
 * IMPORTANT: REJECTED or CANCELED order events are audit records only.
 * They MUST NOT create a position, affect open quantity, or affect P&L.
 */
export interface OrderEvent {
  /** Stable unique identifier for this event. */
  id: string;
  /** Instrument this order belongs to. */
  instrument: InstrumentIdentity;
  /** Intended direction of the order. */
  side: FillSide;
  /** Ordered quantity. */
  quantity: number;
  /** Limit/stop price, if applicable. */
  price?: number;
  /** Current order status. */
  status: OrderEventStatus;
  /** Brokerage account identifier. */
  account: string;
  /** Provider/broker order identifier. */
  orderId?: string;
  /** Rejection or cancellation reason, when available. */
  rejectReason?: string;
  /** Provider timestamp for the order event (ISO-8601). */
  providerTimestamp: string;
  /** Application receive timestamp (ISO-8601). */
  receivedAt: string;
}

// ---------------------------------------------------------------------------
// Open Position State
// ---------------------------------------------------------------------------

/**
 * Represents the current open position state for one instrument + account pair.
 *
 * One TradePosition = one trade lifecycle (open through fully closed).
 * Supports multiple entry fills (scale-in), multiple exit fills (partial exits,
 * scale-out), and full order event audit trail.
 */
export interface TradePosition {
  /** Stable unique identifier for this position lifecycle instance. */
  id: string;
  /** Instrument being traded. */
  instrument: InstrumentIdentity;
  /** Direction of the position. */
  side: TradePositionSide;
  /** Current lifecycle state. */
  status: TradePositionStatus;
  /** Brokerage account. */
  account: string;

  // Entry state
  /** All fills that opened or added to this position. */
  entryFills: Fill[];
  /** Quantity-weighted average entry price: Σ(price_i × qty_i) / Σ(qty_i). */
  averageEntryPrice: number;
  /** Total quantity currently open (totalEntryQuantity − totalExitQuantity). */
  openQuantity: number;
  /** Total quantity entered across all entry fills. */
  totalEntryQuantity: number;
  /** Timestamp of the first entry fill (ISO-8601). */
  firstEntryAt: string;
  /** Timestamp of the most recent entry fill (ISO-8601). */
  lastEntryAt: string;

  // Exit state
  /** All fills that reduced or closed this position. */
  exitFills: Fill[];
  /** Quantity-weighted average exit price. Zero until first exit fill. */
  averageExitPrice: number;
  /** Total quantity exited across all exit fills. */
  totalExitQuantity: number;
  /** Timestamp of the first exit fill (ISO-8601). */
  firstExitAt?: string;
  /** Timestamp of the most recent exit fill (ISO-8601). */
  lastExitAt?: string;

  // Cost state
  /** Sum of all fill-level commissions (positive = cost). */
  totalCommission: number;
  /** Sum of all fill-level fees (positive = cost). */
  totalFees: number;

  // Audit
  /** All order events received for this instrument + account during this lifecycle. */
  orderEvents: OrderEvent[];
  /** Timestamp when this position was first opened (ISO-8601). */
  openedAt: string;
}

// ---------------------------------------------------------------------------
// Completed Trade Lifecycle
// ---------------------------------------------------------------------------

/**
 * Immutable record produced when a TradePosition reaches zero open quantity.
 *
 * Preserves every fill and order event for full auditability while exposing
 * derived lifecycle figures for reporting. Only emitted when residualQuantity === 0.
 */
export interface CompletedTradeLifecycle {
  /** Stable unique identifier — same as the originating TradePosition.id. */
  id: string;
  /** Schema version for forward-compatible deserialization. */
  schemaVersion: number;
  /** Instrument that was traded. */
  instrument: InstrumentIdentity;
  /** Direction of the completed trade. */
  side: TradePositionSide;
  /** Brokerage account. */
  account: string;

  // Raw fills (immutable audit record)
  entryFills: Fill[];
  exitFills: Fill[];
  orderEvents: OrderEvent[];

  // Derived lifecycle figures
  averageEntryPrice: number;
  averageExitPrice: number;
  totalEntryQuantity: number;
  totalExitQuantity: number;
  firstEntryAt: string;
  lastEntryAt: string;
  firstExitAt: string;
  lastExitAt: string;
  /** Duration from first entry fill to last exit fill, in milliseconds. */
  durationMs: number;
  totalCommission: number;
  totalFees: number;
  /**
   * Gross P&L before commissions and fees.
   * LONG: (avgExit − avgEntry) × totalEntryQty
   * SHORT: (avgEntry − avgExit) × totalEntryQty
   */
  grossPnl: number;
  /** Net P&L = grossPnl − totalCommission − totalFees. */
  netPnl: number;
  /** Always true for a completed lifecycle. */
  fullyExited: boolean;
  /** Residual open quantity — always 0 for a completed lifecycle. */
  residualQuantity: number;
  /** ISO-8601 timestamp when this record was assembled by the engine. */
  assembledAt: string;
}

// ---------------------------------------------------------------------------
// Trade Market Context (minimal Phase N placeholder — extended in Phase O)
// ---------------------------------------------------------------------------

/**
 * Minimal market context snapshot attached to trade lifecycle events.
 * Intentionally minimal in Phase N. Extended in Phase O without breaking consumers.
 */
export interface TradeMarketContext {
  /** Symbol for which context was captured. */
  symbol: string;
  /** ISO-8601 timestamp when this context was taken. */
  capturedAt: string;
  /** Last known price at capture time. */
  lastPrice?: number;
}
