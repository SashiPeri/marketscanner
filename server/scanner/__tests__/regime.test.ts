import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { detectRegime } from "../Regime";
import { SymbolState } from "../SymbolState";
import { SCANNER_CONSTANTS } from "../constants";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES", tickSize: 0.25 };

describe("Regime", () => {
  it("labels inside-value low-RVol as CHOPPY / ROTATION", () => {
    const state = new SymbolState(instrument);
    state.vah = 5100;
    state.val = 5080;
    state.poc = 5090;
    state.relativeVolume = 0.5;
    state.currentAtr = 10;
    state.adrFilledPercent = 70;

    const result = detectRegime(state, {
      instrument,
      lastPrice: 5090,
      receivedAt: new Date().toISOString(),
    });

    expect(result.subRegime).toBe("ROTATION");
    expect(result.regime).toBe("CHOPPY");
  });

  it("labels price above VAH as BREAKOUT", () => {
    const state = new SymbolState(instrument);
    state.vah = 5100;
    state.val = 5080;
    state.relativeVolume = 1.2;
    state.currentAtr = 10;

    const result = detectRegime(state, {
      instrument,
      lastPrice: 5110,
      receivedAt: new Date().toISOString(),
    });

    expect(result.subRegime).toBe("BREAKOUT");
  });

  it("keeps trendStrength bounded when ATR is near zero", () => {
    const state = new SymbolState(instrument);
    state.currentAtr = 0;
    for (let i = 0; i < SCANNER_CONSTANTS.PRICE_HISTORY_LENGTH; i++) {
      state.recentPrices.push(100 + i);
    }

    const result = detectRegime(state, {
      instrument,
      lastPrice: 120,
      receivedAt: new Date().toISOString(),
    });

    expect(result.trendStrength).toBeGreaterThanOrEqual(0);
    expect(result.trendStrength).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.trendStrength)).toBe(true);
  });

  it("ignores non-finite prices in the slope window", () => {
    const state = new SymbolState(instrument);
    state.currentAtr = 1;
    state.recentPrices = [100, Number.NaN, 101, 102];

    const result = detectRegime(state, {
      instrument,
      lastPrice: Number.NaN,
      receivedAt: new Date().toISOString(),
    });

    expect(Number.isFinite(result.trendStrength)).toBe(true);
  });
});
