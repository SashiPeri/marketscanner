import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { SymbolState } from "../SymbolState";
import { classifyVolatility, updateAtr } from "../ATR";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES" };

describe("ATR", () => {
  it("seeds on first bar and Wilder-smooths thereafter", () => {
    const state = new SymbolState(instrument);

    updateAtr(state, {
      instrument,
      lastPrice: 100,
      high: 102,
      low: 99,
      receivedAt: new Date().toISOString(),
    });
    expect(state.currentAtr).toBe(3);
    expect(state.atrInitialized).toBe(true);

    updateAtr(state, {
      instrument,
      lastPrice: 101,
      high: 101.5,
      low: 100.5,
      receivedAt: new Date().toISOString(),
    });

    // TR = max(1.0, |101.5-100|, |100.5-100|) = 1.5
    // Wilder: (3 * 13 + 1.5) / 14
    expect(state.currentAtr).toBeCloseTo((3 * 13 + 1.5) / 14, 10);
  });

  it("does not inflate ATR when snapshot carries cumulative session H/L", () => {
    const state = new SymbolState(instrument);
    state.atrInitialized = true;
    state.atrSmoothed = 2;
    state.currentAtr = 2;
    state.prevCloseForAtr = 5100;

    updateAtr(state, {
      instrument,
      lastPrice: 5101,
      high: 5150,
      low: 5050,
      receivedAt: new Date().toISOString(),
    });

    // Session span 100 >> ATR*3 — collapse to |5101-5100|=1
    // Wilder: (2*13 + 1)/14
    expect(state.currentAtr).toBeCloseTo((2 * 13 + 1) / 14, 10);
  });

  it("swaps inverted high/low and ignores non-finite closes", () => {
    const state = new SymbolState(instrument);

    updateAtr(state, {
      instrument,
      lastPrice: 100,
      high: 98,
      low: 101,
      receivedAt: new Date().toISOString(),
    });
    expect(state.currentAtr).toBe(3);

    const before = state.currentAtr;
    updateAtr(state, {
      instrument,
      lastPrice: Number.NaN,
      receivedAt: new Date().toISOString(),
    });
    expect(state.currentAtr).toBe(before);
  });

  it("classifies volatility bands", () => {
    expect(classifyVolatility(0.4, 100)).toBe("LOW");
    expect(classifyVolatility(1.0, 100)).toBe("NORMAL");
    expect(classifyVolatility(2.0, 100)).toBe("HIGH");
    expect(classifyVolatility(4.0, 100)).toBe("EXTREME");
    expect(classifyVolatility(Number.NaN, 100)).toBe("NORMAL");
  });
});
