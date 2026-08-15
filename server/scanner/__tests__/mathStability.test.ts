import { describe, expect, it } from "vitest";
import { buyingPressure, updateDelta } from "../Delta";
import { SymbolState } from "../SymbolState";
import { InstrumentIdentity } from "../../types/domain";
import { detectVwapReclaim, distanceFromVwap, onTradeVwap, updateVolumeMa } from "../VWAP";
import { linearSlope, pushRingBuffer, safeDivide, wilderSmooth } from "../math";

const instrument: InstrumentIdentity = { symbol: "ES", assetClass: "FUTURES" };

describe("Delta zero-tick and guards", () => {
  it("splits unknown zero-tick 50/50 with unchanged net delta", () => {
    const state = new SymbolState(instrument);
    state.prevPrice = 100;

    updateDelta(state, {
      instrument,
      price: 100,
      size: 40,
      receivedAt: new Date().toISOString(),
    });

    expect(state.cumulativeDelta).toBe(0);
    expect(state.buyVolume).toBe(20);
    expect(state.sellVolume).toBe(20);
    expect(buyingPressure(state)).toBeCloseTo(0.5, 10);
  });

  it("ignores non-finite or zero-size trades", () => {
    const state = new SymbolState(instrument);
    updateDelta(state, {
      instrument,
      price: 100,
      size: 0,
      aggressorSide: "BUY",
      receivedAt: new Date().toISOString(),
    });
    updateDelta(state, {
      instrument,
      price: Number.NaN,
      size: 10,
      aggressorSide: "BUY",
      receivedAt: new Date().toISOString(),
    });
    expect(state.cumulativeDelta).toBe(0);
  });
});

describe("VWAP numerical guards", () => {
  it("ignores non-finite volume and keeps distance 0 until volume accrues", () => {
    const state = new SymbolState(instrument);
    onTradeVwap(state, {
      instrument,
      price: 100,
      size: Number.NaN,
      receivedAt: new Date().toISOString(),
    });
    expect(state.vwapCumV).toBe(0);
    expect(distanceFromVwap(state, 100)).toBe(0);
  });

  it("maintains O(1) volume MA via running sum", () => {
    const state = new SymbolState(instrument);
    for (let i = 1; i <= 25; i++) {
      updateVolumeMa(state, i);
    }
    const expected =
      state.recentVolumes.reduce((a, b) => a + b, 0) / state.recentVolumes.length;
    expect(state.volumeMa).toBeCloseTo(expected, 10);
    expect(state.recentVolumes.length).toBe(20);
  });

  it("detects reclaim without mutating MA", () => {
    const state = new SymbolState(instrument);
    state.prevPrice = 99;
    state.prevVwap = 100;
    state.vwap = 100;
    state.volumeMa = 5;
    detectVwapReclaim(state, 101, 20);
    expect(state.vwapReclaim).toBe(true);
  });
});

describe("math helpers", () => {
  it("safeDivide and wilderSmooth guard non-finite / zero period", () => {
    expect(safeDivide(1, 0, 7)).toBe(7);
    expect(safeDivide(Number.NaN, 2, 7)).toBe(7);
    expect(wilderSmooth(10, 20, 0)).toBe(20);
    expect(wilderSmooth(10, Number.NaN, 14)).toBe(10);
  });

  it("pushRingBuffer returns evicted values", () => {
    const buf: number[] = [];
    expect(pushRingBuffer(buf, 1, 2)).toBeUndefined();
    expect(pushRingBuffer(buf, 2, 2)).toBeUndefined();
    expect(pushRingBuffer(buf, 3, 2)).toBe(1);
    expect(buf).toEqual([2, 3]);
  });

  it("linearSlope skips non-finite samples", () => {
    expect(linearSlope([1, Number.NaN, 3])).toBeCloseTo(1, 10);
    expect(linearSlope([1])).toBe(0);
  });
});
