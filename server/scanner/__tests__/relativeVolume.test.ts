import { describe, expect, it } from "vitest";
import { createDefaultIntradayCurve } from "../../baseline/seedBaselines";
import { InstrumentIdentity } from "../../types/domain";
import { classifyRvol, updateRelativeVolume } from "../RelativeVolume";
import { SymbolState } from "../SymbolState";

const instrument: InstrumentIdentity = { symbol: "NQ", assetClass: "FUTURES" };

describe("RelativeVolume", () => {
  it("computes RVol against full-session average when no curve is present", () => {
    const state = new SymbolState(instrument, {
      symbol: "NQ",
      averageSessionVolume: 1_000_000,
    });

    updateRelativeVolume(state, {
      instrument,
      lastPrice: 18000,
      sessionVolume: 1_500_000,
      receivedAt: new Date().toISOString(),
    });

    expect(state.relativeVolume).toBeCloseTo(1.5, 10);
  });

  it("scales expected volume by intraday curve CDF", () => {
    const curve = createDefaultIntradayCurve(4);
    // Force a known CDF: equal buckets → 25% per bucket
    const flat = [0.25, 0.25, 0.25, 0.25];
    const state = new SymbolState(instrument, {
      symbol: "NQ",
      averageSessionVolume: 1_000_000,
      intradayVolumeCurve: flat,
    });
    void curve;

    // Session starts 13:30 UTC; at 13:30 → bucket 0 → CDF 0.25
    updateRelativeVolume(state, {
      instrument,
      lastPrice: 18000,
      sessionVolume: 500_000,
      receivedAt: "2026-08-05T13:30:00.000Z",
    });

    expect(state.relativeVolume).toBeCloseTo(500_000 / (1_000_000 * 0.25), 6);
  });

  it("rejects negative volume and non-finite prices without corrupting state", () => {
    const state = new SymbolState(instrument, {
      symbol: "NQ",
      averageSessionVolume: 1000,
    });
    state.sessionVolume = 100;
    state.relativeVolume = 1;

    updateRelativeVolume(state, {
      instrument,
      lastPrice: Number.NaN,
      sessionVolume: -50,
      receivedAt: "invalid",
    });

    expect(state.sessionVolume).toBe(100);
    expect(state.relativeVolume).toBe(1);
  });

  it("classifies participation tiers", () => {
    expect(classifyRvol(1.6)).toBe("HIGH");
    expect(classifyRvol(1.0)).toBe("NORMAL");
    expect(classifyRvol(0.5)).toBe("LOW");
    expect(classifyRvol(Number.NaN)).toBe("NORMAL");
  });
});
