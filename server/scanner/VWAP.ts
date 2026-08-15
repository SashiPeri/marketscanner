import { TradePrint } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { isFiniteNumber, pushRingBuffer, safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Incremental VWAP accumulator.
 *
 * VWAP = Σ(price × volume) / Σ(volume)
 *
 * Matches the standard session VWAP used by Bloomberg, TradingView, and
 * most execution algos when fed trade prints (or volume-delta snapshots).
 */
export function updateVwap(state: SymbolState, price: number, volume: number): void {
  if (!isFiniteNumber(price) || !isFiniteNumber(volume) || volume <= 0) return;

  state.prevVwap = state.vwap;
  state.vwapCumPV += price * volume;
  state.vwapCumV += volume;

  if (state.vwapCumV > 0 && isFiniteNumber(state.vwapCumPV)) {
    const next = state.vwapCumPV / state.vwapCumV;
    state.vwap = isFiniteNumber(next) ? next : price;
  } else {
    state.vwap = price;
  }
}

/** Signed distance between last price and VWAP in price units. */
export function distanceFromVwap(state: SymbolState, price: number): number {
  if (!isFiniteNumber(price) || !isFiniteNumber(state.vwap) || state.vwapCumV <= 0) return 0;
  return price - state.vwap;
}

/**
 * Detect VWAP reclaim: price crosses above VWAP on elevated volume.
 * Reclaim Long: close_{t-1} < VWAP_{t-1} AND close_t > VWAP_t AND volume > 1.5 × MA(volume)
 */
export function detectVwapReclaim(state: SymbolState, price: number, volume: number): void {
  state.vwapReclaim = false;
  if (!(state.prevVwap > 0) || !(state.prevPrice > 0)) return;
  if (!isFiniteNumber(price) || !isFiniteNumber(volume)) return;

  const volumeThreshold = state.volumeMa * SCANNER_CONSTANTS.VWAP_RECLAIM_VOLUME_MULTIPLIER;
  const crossedAbove = state.prevPrice < state.prevVwap && price > state.vwap;
  const volumeSpike = volume > volumeThreshold && volumeThreshold > 0;

  if (crossedAbove && volumeSpike) {
    state.vwapReclaim = true;
  }
}

/**
 * Detect VWAP rejection: price crosses below VWAP on elevated volume.
 * Mirror of reclaim for bearish institutional absorption.
 */
export function detectVwapRejection(state: SymbolState, price: number, volume: number): void {
  state.vwapRejection = false;
  if (!(state.prevVwap > 0) || !(state.prevPrice > 0)) return;
  if (!isFiniteNumber(price) || !isFiniteNumber(volume)) return;

  const volumeThreshold = state.volumeMa * SCANNER_CONSTANTS.VWAP_RECLAIM_VOLUME_MULTIPLIER;
  const crossedBelow = state.prevPrice > state.prevVwap && price < state.vwap;
  const volumeSpike = volume > volumeThreshold && volumeThreshold > 0;

  if (crossedBelow && volumeSpike) {
    state.vwapRejection = true;
  }
}

/**
 * Update rolling volume moving average used by VWAP signal detection.
 * O(1) via running sum — avoids Array.reduce on every trade.
 */
export function updateVolumeMa(state: SymbolState, volume: number): void {
  if (!isFiniteNumber(volume) || volume < 0) return;

  state.volumeMaSum += volume;
  const evicted = pushRingBuffer(state.recentVolumes, volume, SCANNER_CONSTANTS.VOLUME_MA_PERIOD);
  if (evicted !== undefined) {
    state.volumeMaSum -= evicted;
  }

  const n = state.recentVolumes.length;
  state.volumeMa = n > 0 ? safeDivide(state.volumeMaSum, n, volume) : volume;

  // Guard against accumulated float drift in the running sum.
  if (!isFiniteNumber(state.volumeMaSum) || state.volumeMaSum < 0) {
    let sum = 0;
    for (let i = 0; i < state.recentVolumes.length; i++) {
      sum += state.recentVolumes[i];
    }
    state.volumeMaSum = sum;
    state.volumeMa = n > 0 ? sum / n : volume;
  }
}

/** Process a trade print for VWAP and signal detection. */
export function onTradeVwap(state: SymbolState, trade: TradePrint): void {
  if (!isFiniteNumber(trade.price) || !isFiniteNumber(trade.size) || trade.size <= 0) return;

  updateVolumeMa(state, trade.size);
  updateVwap(state, trade.price, trade.size);
  detectVwapReclaim(state, trade.price, trade.size);
  detectVwapRejection(state, trade.price, trade.size);
  state.prevPrice = trade.price;
}
