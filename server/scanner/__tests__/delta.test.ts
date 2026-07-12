import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { buyingPressure, sellingPressure, updateDelta } from "../Delta";
import { SymbolState } from "../SymbolState";

const instrument: InstrumentIdentity = { symbol: "NQ", assetClass: "FUTURES" };

describe("Delta", () => {
  it("classifies buy aggressor trades as positive delta", () => {
    const state = new SymbolState(instrument);

    updateDelta(state, {
      instrument,
      price: 100,
      size: 50,
      aggressorSide: "BUY",
      receivedAt: new Date().toISOString(),
    });

    expect(state.cumulativeDelta).toBe(50);
    expect(buyingPressure(state)).toBe(1);
    expect(sellingPressure(state)).toBe(0);
  });

  it("uses tick rule when aggressor side is unknown", () => {
    const state = new SymbolState(instrument);
    state.prevPrice = 100;

    updateDelta(state, {
      instrument,
      price: 101,
      size: 25,
      receivedAt: new Date().toISOString(),
    });

    expect(state.cumulativeDelta).toBe(25);
  });
});
