import { TradePrint } from "../types/domain";
import { isFiniteNumber, safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Cumulative Delta — incremental order-flow imbalance.
 * Delta = aggressive buys − aggressive sells.
 *
 * Classification priority:
 * 1. Explicit aggressor side from the feed (preferred)
 * 2. Tick rule (Lee-Ready style): uptick → buy, downtick → sell
 * 3. Zero-tick / unknown: split 50/50 (delta unchanged, both sides accrue half)
 */
export function updateDelta(state: SymbolState, trade: TradePrint): void {
  if (!isFiniteNumber(trade.price) || !isFiniteNumber(trade.size) || trade.size <= 0) return;

  const classification = classifyTradeDelta(trade, state.prevPrice);

  state.cumulativeDelta += classification.signedVolume;
  state.buyVolume += classification.buyVolume;
  state.sellVolume += classification.sellVolume;

  if (isFiniteNumber(state.cumulativeDelta)) {
    state.sessionDeltaHigh = Math.max(state.sessionDeltaHigh, state.cumulativeDelta);
    state.sessionDeltaLow = Math.min(state.sessionDeltaLow, state.cumulativeDelta);
  }

  const total = state.buyVolume + state.sellVolume;
  state.tradeImbalance = total > 0 ? safeDivide(state.buyVolume - state.sellVolume, total, 0) : 0;
}

interface DeltaClassification {
  signedVolume: number;
  buyVolume: number;
  sellVolume: number;
}

function classifyTradeDelta(trade: TradePrint, prevPrice: number): DeltaClassification {
  const size = trade.size;

  if (trade.aggressorSide === "BUY") {
    return { signedVolume: size, buyVolume: size, sellVolume: 0 };
  }
  if (trade.aggressorSide === "SELL") {
    return { signedVolume: -size, buyVolume: 0, sellVolume: size };
  }

  if (prevPrice > 0 && isFiniteNumber(prevPrice)) {
    if (trade.price > prevPrice) {
      return { signedVolume: size, buyVolume: size, sellVolume: 0 };
    }
    if (trade.price < prevPrice) {
      return { signedVolume: -size, buyVolume: 0, sellVolume: size };
    }
  }

  // Zero-tick / unknown: split 50/50 — net delta unchanged.
  const half = size / 2;
  return { signedVolume: 0, buyVolume: half, sellVolume: half };
}

/** Buying pressure as fraction of total classified volume [0, 1]. */
export function buyingPressure(state: SymbolState): number {
  const total = state.buyVolume + state.sellVolume;
  return total > 0 ? safeDivide(state.buyVolume, total, 0.5) : 0.5;
}

/** Selling pressure as fraction of total classified volume [0, 1]. */
export function sellingPressure(state: SymbolState): number {
  const total = state.buyVolume + state.sellVolume;
  return total > 0 ? safeDivide(state.sellVolume, total, 0.5) : 0.5;
}

/** Detect bearish delta divergence: new price high without new delta high. */
export function hasDeltaDivergence(state: SymbolState, price: number): boolean {
  if (!isFiniteNumber(price)) return false;
  if (!isFiniteNumber(state.sessionHigh) || state.sessionHigh === -Infinity) return false;
  if (!isFiniteNumber(state.sessionDeltaHigh) || state.sessionDeltaHigh === -Infinity) return false;

  const newPriceHigh = price >= state.sessionHigh;
  const deltaNotConfirming = state.cumulativeDelta < state.sessionDeltaHigh * 0.9;
  return newPriceHigh && deltaNotConfirming;
}
