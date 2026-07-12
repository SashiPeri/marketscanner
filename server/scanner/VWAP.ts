import { TradePrint } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { pushRingBuffer } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Incremental VWAP accumulator.
 * VWAP = Σ(price × volume) / Σ(volume)
 */
export function updateVwap(state: SymbolState, price: number, volume: number): void {
  if (volume <= 0) return;

  state.prevVwap = state.vwap;
  state.vwapCumPV += price * volume;
  state.vwapCumV += volume;
  state.vwap = state.vwapCumV > 0 ? state.vwapCumPV / state.vwapCumV : price;
}

/** Signed distance between last price and VWAP in price units. */
export function distanceFromVwap(state: SymbolState, price: number): number {
  if (state.vwap <= 0) return 0;
  return price - state.vwap;
}

/**
 * Detect VWAP reclaim: price crosses above VWAP on elevated volume.
 * Reclaim Long: close_{t-1} < VWAP_{t-1} AND close_t > VWAP_t AND volume > 1.5 × MA(volume)
 */
export function detectVwapReclaim(state: SymbolState, price: number, volume: number): void {
  state.vwapReclaim = false;
  if (state.prevVwap <= 0 || state.prevPrice <= 0) return;

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
  if (state.prevVwap <= 0 || state.prevPrice <= 0) return;

  const volumeThreshold = state.volumeMa * SCANNER_CONSTANTS.VWAP_RECLAIM_VOLUME_MULTIPLIER;
  const crossedBelow = state.prevPrice > state.prevVwap && price < state.vwap;
  const volumeSpike = volume > volumeThreshold && volumeThreshold > 0;

  if (crossedBelow && volumeSpike) {
    state.vwapRejection = true;
  }
}

/** Update rolling volume moving average used by VWAP signal detection. */
export function updateVolumeMa(state: SymbolState, volume: number): void {
  pushRingBuffer(state.recentVolumes, volume, SCANNER_CONSTANTS.VOLUME_MA_PERIOD);
  if (state.recentVolumes.length === 0) {
    state.volumeMa = volume;
    return;
  }
  const sum = state.recentVolumes.reduce((acc, v) => acc + v, 0);
  state.volumeMa = sum / state.recentVolumes.length;
}

/** Process a trade print for VWAP and signal detection. */
export function onTradeVwap(state: SymbolState, trade: TradePrint): void {
  updateVolumeMa(state, trade.size);
  updateVwap(state, trade.price, trade.size);
  detectVwapReclaim(state, trade.price, trade.size);
  detectVwapRejection(state, trade.price, trade.size);
  state.prevPrice = trade.price;
}
