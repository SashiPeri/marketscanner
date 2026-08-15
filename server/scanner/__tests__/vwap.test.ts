import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { SymbolState } from "../SymbolState";
import { detectVwapReclaim, distanceFromVwap, onTradeVwap } from "../VWAP";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES" };

describe("VWAP", () => {
  it("accumulates volume-weighted average price incrementally", () => {
    const state = new SymbolState(instrument);

    onTradeVwap(state, {
      instrument,
      price: 100,
      size: 10,
      receivedAt: new Date().toISOString(),
    });
    onTradeVwap(state, {
      instrument,
      price: 110,
      size: 10,
      receivedAt: new Date().toISOString(),
    });

    expect(state.vwap).toBe(105);
    expect(distanceFromVwap(state, 110)).toBe(5);
  });

  it("detects VWAP reclaim on elevated volume", () => {
    const state = new SymbolState(instrument);
    state.prevPrice = 99;
    state.prevVwap = 100;
    state.vwap = 100;
    state.volumeMa = 5;

    detectVwapReclaim(state, 101, 20);

    expect(state.vwapReclaim).toBe(true);
  });
});
