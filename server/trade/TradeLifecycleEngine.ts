import { randomUUID } from "crypto";
import {
  CompletedTradeLifecycle,
  Fill,
  OrderEvent,
  TRADE_LIFECYCLE_SCHEMA_VERSION,
  TradePosition,
  TradePositionSide,
} from "./types";
import { RawFillRepository } from "./raw/RawFillRepository";
import { RawOrderRepository } from "./raw/RawOrderRepository";
import { TradeLifecycleRepository } from "./derived/TradeLifecycleRepository";

export interface FillProcessingResult {
  openPosition?: TradePosition;
  completedLifecycles: CompletedTradeLifecycle[];
}

/**
 * Assembles fills and order events into trade lifecycle objects.
 * Rules: one position = one lifecycle; VWAP averaging; partial exits;
 * position flip; REJECTED/CANCELED events are audit-only.
 */
export class TradeLifecycleEngine {
  constructor(
    private readonly rawFills: RawFillRepository,
    private readonly rawOrders: RawOrderRepository,
    private readonly lifecycles: TradeLifecycleRepository,
  ) {}

  onFill(fill: Fill): FillProcessingResult {
    this.rawFills.append(fill);
    return this.processFill(fill);
  }

  onOrderEvent(event: OrderEvent): void {
    this.rawOrders.append(event);
    const existing = this.lifecycles.findOpenPosition(
      event.account,
      event.instrument.symbol,
    );
    if (existing) {
      this.lifecycles.savePosition({
        ...existing,
        orderEvents: [...existing.orderEvents, event],
      });
    }
  }

  private processFill(fill: Fill): FillProcessingResult {
    const existing = this.lifecycles.findOpenPosition(
      fill.account,
      fill.instrument.symbol,
    );
    if (!existing) {
      return { openPosition: this.openPosition(fill), completedLifecycles: [] };
    }
    const adding =
      (existing.side === "LONG" && fill.side === "BUY") ||
      (existing.side === "SHORT" && fill.side === "SELL");
    if (adding) {
      return { openPosition: this.addEntryFill(existing, fill), completedLifecycles: [] };
    }
    const closeQty = fill.quantity;
    const openQty = existing.openQuantity;
    if (closeQty < openQty) {
      return { openPosition: this.addExitFill(existing, fill, closeQty), completedLifecycles: [] };
    }
    if (closeQty === openQty) {
      return { completedLifecycles: [this.closePosition(existing, fill, closeQty)] };
    }
    return this.handleFlip(existing, fill, openQty);
  }

  private openPosition(fill: Fill): TradePosition {
    const side: TradePositionSide = fill.side === "BUY" ? "LONG" : "SHORT";
    const pos: TradePosition = {
      id: randomUUID(),
      instrument: fill.instrument,
      side,
      status: "OPEN",
      account: fill.account,
      entryFills: [fill],
      averageEntryPrice: fill.price,
      openQuantity: fill.quantity,
      totalEntryQuantity: fill.quantity,
      firstEntryAt: fill.providerTimestamp,
      lastEntryAt: fill.providerTimestamp,
      exitFills: [],
      averageExitPrice: 0,
      totalExitQuantity: 0,
      totalCommission: fill.commission ?? 0,
      totalFees: fill.fees ?? 0,
      orderEvents: [],
      openedAt: fill.receivedAt,
    };
    this.lifecycles.savePosition(pos);
    return pos;
  }

  private addEntryFill(pos: TradePosition, fill: Fill): TradePosition {
    const updated: TradePosition = {
      ...pos,
      entryFills: [...pos.entryFills, fill],
      averageEntryPrice: computeWeightedAverage(
        pos.averageEntryPrice, pos.totalEntryQuantity, fill.price, fill.quantity,
      ),
      openQuantity: pos.openQuantity + fill.quantity,
      totalEntryQuantity: pos.totalEntryQuantity + fill.quantity,
      lastEntryAt: fill.providerTimestamp,
      totalCommission: pos.totalCommission + (fill.commission ?? 0),
      totalFees: pos.totalFees + (fill.fees ?? 0),
    };
    this.lifecycles.savePosition(updated);
    return updated;
  }

  private addExitFill(pos: TradePosition, fill: Fill, exitQty: number): TradePosition {
    const updated: TradePosition = {
      ...pos,
      exitFills: [...pos.exitFills, fill],
      averageExitPrice: computeWeightedAverage(
        pos.averageExitPrice, pos.totalExitQuantity, fill.price, exitQty,
      ),
      openQuantity: pos.openQuantity - exitQty,
      totalExitQuantity: pos.totalExitQuantity + exitQty,
      firstExitAt: pos.firstExitAt ?? fill.providerTimestamp,
      lastExitAt: fill.providerTimestamp,
      totalCommission: pos.totalCommission + (fill.commission ?? 0),
      totalFees: pos.totalFees + (fill.fees ?? 0),
    };
    this.lifecycles.savePosition(updated);
    return updated;
  }

  private closePosition(pos: TradePosition, fill: Fill, exitQty: number): CompletedTradeLifecycle {
    const exitFills = [...pos.exitFills, fill];
    const avgExit = computeWeightedAverage(pos.averageExitPrice, pos.totalExitQuantity, fill.price, exitQty);
    const totalCommission = pos.totalCommission + (fill.commission ?? 0);
    const totalFees = pos.totalFees + (fill.fees ?? 0);
    const firstExitAt = pos.firstExitAt ?? fill.providerTimestamp;
    const lastExitAt = fill.providerTimestamp;
    const grossPnl = computeGrossPnl(pos.side, pos.averageEntryPrice, avgExit, pos.totalEntryQuantity);
    const firstMs = Date.parse(pos.firstEntryAt);
    const lastMs = Date.parse(lastExitAt);
    const durationMs = Number.isFinite(firstMs) && Number.isFinite(lastMs)
      ? Math.max(0, lastMs - firstMs) : 0;

    const completed: CompletedTradeLifecycle = {
      id: pos.id,
      schemaVersion: TRADE_LIFECYCLE_SCHEMA_VERSION,
      instrument: pos.instrument,
      side: pos.side,
      account: pos.account,
      entryFills: pos.entryFills,
      exitFills,
      orderEvents: pos.orderEvents,
      averageEntryPrice: pos.averageEntryPrice,
      averageExitPrice: avgExit,
      totalEntryQuantity: pos.totalEntryQuantity,
      totalExitQuantity: pos.totalExitQuantity + exitQty,
      firstEntryAt: pos.firstEntryAt,
      lastEntryAt: pos.lastEntryAt,
      firstExitAt,
      lastExitAt,
      durationMs,
      totalCommission,
      totalFees,
      grossPnl,
      netPnl: grossPnl - totalCommission - totalFees,
      fullyExited: true,
      residualQuantity: 0,
      assembledAt: new Date().toISOString(),
    };
    this.lifecycles.removePosition(pos.id);
    this.lifecycles.saveLifecycle(completed);
    return completed;
  }

  /**
   * Position flip: fill.quantity > pos.openQuantity.
   * Splits fill into close portion (openQty) + open portion (remainder).
   * Costs are prorated proportionally to quantity.
   * Synthetic ids: "originalId::close" and "originalId::open".
   */
  private handleFlip(pos: TradePosition, fill: Fill, openQty: number): FillProcessingResult {
    const flipQty = fill.quantity - openQty;
    const cf = openQty / fill.quantity;
    const of_ = flipQty / fill.quantity;
    const closingFill: Fill = {
      ...fill, id: `${fill.id}::close`, quantity: openQty,
      commission: fill.commission !== undefined ? fill.commission * cf : undefined,
      fees: fill.fees !== undefined ? fill.fees * cf : undefined,
    };
    const openingFill: Fill = {
      ...fill, id: `${fill.id}::open`, quantity: flipQty,
      commission: fill.commission !== undefined ? fill.commission * of_ : undefined,
      fees: fill.fees !== undefined ? fill.fees * of_ : undefined,
    };
    const completed = this.closePosition(pos, closingFill, openQty);
    const newPosition = this.openPosition(openingFill);
    return { openPosition: newPosition, completedLifecycles: [completed] };
  }
}

// ---------------------------------------------------------------------------
// Exported pure math helpers
// ---------------------------------------------------------------------------

/**
 * Quantity-weighted running average (VWAP-style).
 * Returns newPrice when existingQty is 0 (no prior fills).
 */
export function computeWeightedAverage(
  existingAvg: number,
  existingQty: number,
  newPrice: number,
  newQty: number,
): number {
  if (!Number.isFinite(existingAvg) || !Number.isFinite(existingQty) || existingQty <= 0) {
    return newPrice;
  }
  const total = existingQty + newQty;
  return total <= 0 ? newPrice : (existingAvg * existingQty + newPrice * newQty) / total;
}

/**
 * Gross P&L before commissions and fees.
 * LONG: (avgExit − avgEntry) × qty
 * SHORT: (avgEntry − avgExit) × qty
 */
export function computeGrossPnl(
  side: TradePositionSide,
  avgEntry: number,
  avgExit: number,
  qty: number,
): number {
  return side === "LONG" ? (avgExit - avgEntry) * qty : (avgEntry - avgExit) * qty;
}
