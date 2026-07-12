import { describe, expect, it } from "vitest";
import { InstrumentIdentity } from "../../types/domain";
import { SymbolState } from "../SymbolState";
import { recalculateValueArea, updateVolumeProfile } from "../VolumeProfile";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES", tickSize: 1 };

describe("VolumeProfile", () => {
  it("tracks POC and value area from trade prints", () => {
    const state = new SymbolState(instrument);

    const trades = [
      { price: 100, size: 100 },
      { price: 101, size: 200 },
      { price: 102, size: 50 },
      { price: 101, size: 150 },
    ];

    for (const trade of trades) {
      updateVolumeProfile(state, {
        instrument,
        price: trade.price,
        size: trade.size,
        aggressorSide: "BUY",
        receivedAt: new Date().toISOString(),
      });
    }

    recalculateValueArea(state);

    expect(state.poc).toBe(101);
    expect(state.vah).toBeGreaterThanOrEqual(state.val);
    expect(state.profileTotalVolume).toBe(500);
  });
});
