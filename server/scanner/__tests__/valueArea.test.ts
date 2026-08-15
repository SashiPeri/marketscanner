import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { SymbolState } from "../SymbolState";
import { recalculateValueArea, updateVolumeProfile } from "../VolumeProfile";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES", tickSize: 0.25 };

describe("VolumeProfile / Value Area", () => {
  it("tracks POC with integer tick buckets (float-safe)", () => {
    const state = new SymbolState(instrument);

    // 0.25 tick: 100.00, 100.25, 100.50 — heavy volume at 100.25
    const prints = [
      { price: 100.0, size: 10 },
      { price: 100.25, size: 50 },
      { price: 100.5, size: 10 },
      { price: 100.25, size: 40 },
    ];

    for (const p of prints) {
      updateVolumeProfile(state, {
        instrument,
        price: p.price,
        size: p.size,
        aggressorSide: "BUY",
        receivedAt: new Date().toISOString(),
      });
    }

    expect(state.poc).toBeCloseTo(100.25, 10);
    expect(state.pocVolume).toBe(90);
    expect(state.profileTotalVolume).toBe(110);
  });

  it("expands both sides on equal adjacent volume (Market Profile tie rule)", () => {
    const state = new SymbolState(instrument);
    // Flat profile around POC so ties are forced
    state.profileBuckets.set(state.priceToBucketIndex(100), 100);
    state.profileBuckets.set(state.priceToBucketIndex(100.25), 50);
    state.profileBuckets.set(state.priceToBucketIndex(99.75), 50);
    state.profileBuckets.set(state.priceToBucketIndex(100.5), 10);
    state.profileBuckets.set(state.priceToBucketIndex(99.5), 10);
    state.profileTotalVolume = 220;
    state.poc = 100;
    state.pocVolume = 100;

    recalculateValueArea(state);

    expect(state.val).toBeLessThanOrEqual(state.poc);
    expect(state.vah).toBeGreaterThanOrEqual(state.poc);
    // With 70% target of 220 = 154, POC(100)+both(50+50)=200 ≥ target → VA includes ±0.25
    expect(state.val).toBeCloseTo(99.75, 10);
    expect(state.vah).toBeCloseTo(100.25, 10);
  });

  it("ignores zero-size and non-finite trades", () => {
    const state = new SymbolState(instrument);
    updateVolumeProfile(state, {
      instrument,
      price: 100,
      size: 0,
      receivedAt: new Date().toISOString(),
    });
    updateVolumeProfile(state, {
      instrument,
      price: Number.NaN,
      size: 10,
      receivedAt: new Date().toISOString(),
    });
    expect(state.profileTotalVolume).toBe(0);
    expect(state.profileBuckets.size).toBe(0);
  });
});
