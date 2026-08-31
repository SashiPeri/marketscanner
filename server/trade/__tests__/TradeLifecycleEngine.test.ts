import { describe, expect, it } from "vitest";
import { TradeLifecycleEngine, computeWeightedAverage, computeGrossPnl } from "../TradeLifecycleEngine";
import { MemoryRawFillRepository } from "../raw/MemoryRawFillRepository";
import { MemoryRawOrderRepository } from "../raw/MemoryRawOrderRepository";
import { MemoryTradeLifecycleRepository } from "../derived/MemoryTradeLifecycleRepository";
import { Fill, OrderEvent } from "../types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let seq = 0;

function makeFill(
  overrides: Partial<Fill> & { side: Fill["side"]; price: number; quantity: number },
): Fill {
  seq++;
  const ts = new Date(Date.UTC(2026, 0, 2, 9, 30, seq)).toISOString();
  return {
    id: `fill-${seq}`,
    instrument: overrides.instrument ?? { symbol: "ES", assetClass: "FUTURES" },
    side: overrides.side,
    price: overrides.price,
    quantity: overrides.quantity,
    account: overrides.account ?? "ACC1",
    orderId: overrides.orderId,
    executionId: overrides.executionId,
    commission: overrides.commission,
    fees: overrides.fees,
    providerTimestamp: overrides.providerTimestamp ?? ts,
    receivedAt: overrides.receivedAt ?? ts,
  };
}

function makeOrderEvent(
  overrides: Partial<OrderEvent> & { status: OrderEvent["status"]; side: OrderEvent["side"] },
): OrderEvent {
  seq++;
  const ts = new Date(Date.UTC(2026, 0, 2, 9, 30, seq)).toISOString();
  return {
    id: `order-${seq}`,
    instrument: overrides.instrument ?? { symbol: "ES", assetClass: "FUTURES" },
    side: overrides.side,
    quantity: overrides.quantity ?? 2,
    price: overrides.price,
    status: overrides.status,
    account: overrides.account ?? "ACC1",
    orderId: overrides.orderId,
    rejectReason: overrides.rejectReason,
    providerTimestamp: overrides.providerTimestamp ?? ts,
    receivedAt: overrides.receivedAt ?? ts,
  };
}

function makeEngine() {
  const rawFills = new MemoryRawFillRepository();
  const rawOrders = new MemoryRawOrderRepository();
  const lifecycles = new MemoryTradeLifecycleRepository();
  const engine = new TradeLifecycleEngine(rawFills, rawOrders, lifecycles);
  return { engine, rawFills, rawOrders, lifecycles };
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

describe("computeWeightedAverage", () => {
  it("returns newPrice when existingQty is 0", () => {
    expect(computeWeightedAverage(0, 0, 5100, 2)).toBe(5100);
  });

  it("computes weighted average of two fills", () => {
    // 2 @ 5100 + 3 @ 5105 = (10200 + 15315) / 5 = 5103
    expect(computeWeightedAverage(5100, 2, 5105, 3)).toBeCloseTo(5103, 5);
  });

  it("handles non-finite existingAvg by returning newPrice", () => {
    expect(computeWeightedAverage(NaN, 2, 5100, 1)).toBe(5100);
    expect(computeWeightedAverage(Infinity, 2, 5100, 1)).toBe(5100);
  });
});

describe("computeGrossPnl", () => {
  it("LONG positive when exit > entry", () => {
    expect(computeGrossPnl("LONG", 5100, 5110, 2)).toBeCloseTo(20, 10);
  });
  it("LONG negative when exit < entry", () => {
    expect(computeGrossPnl("LONG", 5110, 5100, 2)).toBeCloseTo(-20, 10);
  });
  it("SHORT positive when entry > exit", () => {
    expect(computeGrossPnl("SHORT", 5110, 5100, 2)).toBeCloseTo(20, 10);
  });
  it("SHORT negative when entry < exit", () => {
    expect(computeGrossPnl("SHORT", 5100, 5110, 2)).toBeCloseTo(-20, 10);
  });
});

// ---------------------------------------------------------------------------
// Single-fill entry + exit
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — single fill entry + exit", () => {
  it("opens a LONG position on BUY fill", () => {
    const { engine, lifecycles } = makeEngine();
    const r = engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2 }));
    expect(r.completedLifecycles).toHaveLength(0);
    expect(r.openPosition!.side).toBe("LONG");
    expect(r.openPosition!.openQuantity).toBe(2);
    expect(r.openPosition!.averageEntryPrice).toBe(5100);
    expect(lifecycles.openPositionCount()).toBe(1);
  });

  it("completes LONG lifecycle on matching SELL", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 2 }));
    expect(r.completedLifecycles).toHaveLength(1);
    expect(r.openPosition).toBeUndefined();
    const lc = r.completedLifecycles[0];
    expect(lc.fullyExited).toBe(true);
    expect(lc.residualQuantity).toBe(0);
    expect(lc.grossPnl).toBeCloseTo(20, 10);
    expect(lc.schemaVersion).toBe(1);
    expect(lifecycles.lifecycleCount()).toBe(1);
    expect(lifecycles.openPositionCount()).toBe(0);
  });

  it("opens a SHORT on SELL fill with no existing position", () => {
    const { engine } = makeEngine();
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 3 }));
    expect(r.openPosition!.side).toBe("SHORT");
    expect(r.openPosition!.openQuantity).toBe(3);
  });

  it("completes SHORT lifecycle on matching BUY", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 3 }));
    const r = engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 3 }));
    const lc = r.completedLifecycles[0];
    expect(lc.grossPnl).toBeCloseTo(30, 10);
    expect(lc.fullyExited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-fill weighted average entry (scale-in)
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — multi-fill weighted average entry", () => {
  it("computes VWAP across three entry fills", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2 }));
    engine.onFill(makeFill({ side: "BUY", price: 5104, quantity: 3 }));
    const r = engine.onFill(makeFill({ side: "BUY", price: 5106, quantity: 5 }));
    const pos = r.openPosition!;
    // (5100*2 + 5104*3 + 5106*5) / 10 = 5104.2
    expect(pos.openQuantity).toBe(10);
    expect(pos.entryFills).toHaveLength(3);
    expect(pos.averageEntryPrice).toBeCloseTo(5104.2, 5);
  });

  it("uses correct avg entry price for gross P&L", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 4 }));
    engine.onFill(makeFill({ side: "BUY", price: 5108, quantity: 4 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5120, quantity: 8 }));
    const lc = r.completedLifecycles[0];
    expect(lc.averageEntryPrice).toBeCloseTo(5104, 5);
    expect(lc.grossPnl).toBeCloseTo((5120 - 5104) * 8, 5);
  });
});

// ---------------------------------------------------------------------------
// Multi-fill weighted average exit (scale-out)
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — multi-fill weighted average exit", () => {
  it("computes VWAP across two exit fills", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 6 }));
    engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 2 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5116, quantity: 4 }));
    const lc = r.completedLifecycles[0];
    // (5110*2 + 5116*4)/6 = 5114
    expect(lc.averageExitPrice).toBeCloseTo(5114, 5);
    expect(lc.totalExitQuantity).toBe(6);
    expect(lc.exitFills).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Partial exit
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — partial exit", () => {
  it("SELL 4 of LONG 10 does NOT complete lifecycle", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 10 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 4 }));
    expect(r.completedLifecycles).toHaveLength(0);
    expect(r.openPosition!.openQuantity).toBe(6);
    expect(r.openPosition!.totalExitQuantity).toBe(4);
    expect(lifecycles.lifecycleCount()).toBe(0);
  });

  it("completes lifecycle only after all quantity exited", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 10 }));
    engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 4 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5115, quantity: 6 }));
    expect(r.completedLifecycles).toHaveLength(1);
    expect(lifecycles.lifecycleCount()).toBe(1);
    expect(lifecycles.openPositionCount()).toBe(0);
  });

  it("partial exit of SHORT leaves position open", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 8 }));
    const r = engine.onFill(makeFill({ side: "BUY", price: 5105, quantity: 3 }));
    expect(r.openPosition!.openQuantity).toBe(5);
    expect(r.completedLifecycles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scale-in
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — scale-in", () => {
  it("accumulates openQuantity and recalculates averageEntryPrice", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2 }));
    engine.onFill(makeFill({ side: "BUY", price: 5102, quantity: 2 }));
    const r = engine.onFill(makeFill({ side: "BUY", price: 5104, quantity: 2 }));
    const pos = r.openPosition!;
    expect(pos.openQuantity).toBe(6);
    expect(pos.entryFills).toHaveLength(3);
    expect(pos.averageEntryPrice).toBeCloseTo((5100 + 5102 + 5104) / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// Position flip LONG → SHORT
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — position flip LONG → SHORT", () => {
  it("closes LONG and opens SHORT when SELL qty > open qty", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 4 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5108, quantity: 7 }));
    expect(r.completedLifecycles).toHaveLength(1);
    expect(r.openPosition!.side).toBe("SHORT");
    expect(r.openPosition!.openQuantity).toBe(3);
    expect(lifecycles.lifecycleCount()).toBe(1);
    const lc = r.completedLifecycles[0];
    expect(lc.side).toBe("LONG");
    expect(lc.grossPnl).toBeCloseTo((5108 - 5100) * 4, 5);
  });
});

// ---------------------------------------------------------------------------
// Position flip SHORT → LONG
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — position flip SHORT → LONG", () => {
  it("closes SHORT and opens LONG when BUY qty > open qty", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 3 }));
    const r = engine.onFill(makeFill({ side: "BUY", price: 5105, quantity: 5 }));
    expect(r.completedLifecycles).toHaveLength(1);
    expect(r.openPosition!.side).toBe("LONG");
    expect(r.openPosition!.openQuantity).toBe(2);
    const lc = r.completedLifecycles[0];
    expect(lc.side).toBe("SHORT");
    expect(lc.grossPnl).toBeCloseTo((5110 - 5105) * 3, 5);
  });
});

// ---------------------------------------------------------------------------
// Rejected order
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — rejected order", () => {
  it("REJECTED does not open a position", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onOrderEvent(makeOrderEvent({ side: "BUY", status: "REJECTED", quantity: 5 }));
    expect(lifecycles.openPositionCount()).toBe(0);
    expect(lifecycles.lifecycleCount()).toBe(0);
  });
  it("REJECTED stored in raw repository", () => {
    const { engine, rawOrders } = makeEngine();
    engine.onOrderEvent(makeOrderEvent({ side: "BUY", status: "REJECTED", quantity: 5 }));
    expect(rawOrders.size()).toBe(1);
  });
  it("REJECTED does not change open position quantity", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 4 }));
    engine.onOrderEvent(makeOrderEvent({ side: "BUY", status: "REJECTED", quantity: 10 }));
    expect(lifecycles.findOpenPosition("ACC1", "ES")!.openQuantity).toBe(4);
  });
  it("REJECTED attached to open position orderEvents", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2 }));
    engine.onOrderEvent(makeOrderEvent({ side: "BUY", status: "REJECTED", quantity: 3 }));
    const pos = lifecycles.findOpenPosition("ACC1", "ES");
    expect(pos!.orderEvents).toHaveLength(1);
    expect(pos!.orderEvents[0].status).toBe("REJECTED");
    expect(pos!.openQuantity).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cancelled order
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — cancelled order", () => {
  it("CANCELED does not create a position", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onOrderEvent(makeOrderEvent({ side: "SELL", status: "CANCELED", quantity: 2 }));
    expect(lifecycles.openPositionCount()).toBe(0);
  });
  it("CANCELED does not affect open position quantity", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 5 }));
    engine.onOrderEvent(makeOrderEvent({ side: "SELL", status: "CANCELED", quantity: 5 }));
    const pos = lifecycles.findOpenPosition("ACC1", "ES");
    expect(pos!.openQuantity).toBe(5);
    expect(pos!.orderEvents[0].status).toBe("CANCELED");
  });
});

// ---------------------------------------------------------------------------
// Commissions, fees, net P&L
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — commissions, fees, net P&L", () => {
  it("subtracts commissions and fees from gross P&L", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2, commission: 2.50, fees: 0.50 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 2, commission: 2.50, fees: 0.50 }));
    const lc = r.completedLifecycles[0];
    expect(lc.grossPnl).toBeCloseTo(20, 5);
    expect(lc.totalCommission).toBeCloseTo(5, 5);
    expect(lc.totalFees).toBeCloseTo(1, 5);
    expect(lc.netPnl).toBeCloseTo(14, 5);
  });
  it("net P&L negative when commissions exceed gross profit", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 1, commission: 10 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5102, quantity: 1, commission: 10 }));
    expect(r.completedLifecycles[0].netPnl).toBeCloseTo(-18, 5);
  });
  it("accumulates commissions across scale-in fills", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2, commission: 2 }));
    engine.onFill(makeFill({ side: "BUY", price: 5102, quantity: 2, commission: 2 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 4, commission: 4 }));
    expect(r.completedLifecycles[0].totalCommission).toBeCloseTo(8, 5);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle completeness guard
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — lifecycle completeness guard", () => {
  it("does not emit completed lifecycle while residualQuantity > 0", () => {
    const { engine, lifecycles } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 10 }));
    engine.onFill(makeFill({ side: "SELL", price: 5105, quantity: 3 }));
    engine.onFill(makeFill({ side: "SELL", price: 5107, quantity: 4 }));
    expect(lifecycles.lifecycleCount()).toBe(0);
    expect(lifecycles.openPositionCount()).toBe(1);
    expect(lifecycles.listOpenPositions()[0].openQuantity).toBe(3);
  });
  it("completed lifecycle has residualQuantity === 0 and fullyExited === true", () => {
    const { engine } = makeEngine();
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 5 }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5112, quantity: 5 }));
    expect(r.completedLifecycles[0].residualQuantity).toBe(0);
    expect(r.completedLifecycles[0].fullyExited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Append-only guards
// ---------------------------------------------------------------------------

describe("RawFillRepository — append-only", () => {
  it("throws on duplicate fill id", () => {
    const { engine } = makeEngine();
    const fill = makeFill({ side: "BUY", price: 5100, quantity: 1 });
    engine.onFill(fill);
    expect(() => engine.onFill(fill)).toThrow(/duplicate fill id/);
  });
});

describe("RawOrderRepository — append-only", () => {
  it("throws on duplicate order event id", () => {
    const { engine } = makeEngine();
    const ev = makeOrderEvent({ side: "BUY", status: "WORKING" });
    engine.onOrderEvent(ev);
    expect(() => engine.onOrderEvent(ev)).toThrow(/duplicate order event id/);
  });
});

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

describe("TradeLifecycleEngine — duration", () => {
  it("computes durationMs from firstEntryAt to lastExitAt", () => {
    const { engine } = makeEngine();
    const entryTs = "2026-01-02T09:30:00.000Z";
    const exitTs  = "2026-01-02T10:15:00.000Z";
    engine.onFill(makeFill({ side: "BUY", price: 5100, quantity: 2,
      providerTimestamp: entryTs, receivedAt: entryTs }));
    const r = engine.onFill(makeFill({ side: "SELL", price: 5110, quantity: 2,
      providerTimestamp: exitTs, receivedAt: exitTs }));
    expect(r.completedLifecycles[0].durationMs).toBe(45 * 60 * 1000);
    expect(r.completedLifecycles[0].firstEntryAt).toBe(entryTs);
    expect(r.completedLifecycles[0].lastExitAt).toBe(exitTs);
  });
});
