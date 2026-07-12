import { TradePrint } from "../types/domain";
import { SymbolState } from "./SymbolState";

/**
 * Cumulative Delta — incremental order-flow imbalance.
 * Delta = aggressive buys − aggressive sells.
 *
 * When aggressor side is unknown, classify via tick rule:
 * uptick → buy, downtick → sell, unchanged → split 50/50.
 */
export function updateDelta(state: SymbolState, trade: TradePrint): void {
  const signedVolume = classifyTradeDelta(trade, state.prevPrice);

  state.cumulativeDelta += signedVolume;

  if (signedVolume > 0) {
    state.buyVolume += trade.size;
  } else if (signedVolume < 0) {
    state.sellVolume += trade.size;
  }

  state.sessionDeltaHigh = Math.max(state.sessionDeltaHigh, state.cumulativeDelta);
  state.sessionDeltaLow = Math.min(state.sessionDeltaLow, state.cumulativeDelta);

  const total = state.buyVolume + state.sellVolume;
  state.tradeImbalance = total > 0 ? (state.buyVolume - state.sellVolume) / total : 0;
}

function classifyTradeDelta(trade: TradePrint, prevPrice: number): number {
  if (trade.aggressorSide === "BUY") return trade.size;
  if (trade.aggressorSide === "SELL") return -trade.size;

  if (prevPrice > 0) {
    if (trade.price > prevPrice) return trade.size;
    if (trade.price < prevPrice) return -trade.size;
  }

  return 0;
}

/** Buying pressure as fraction of total classified volume [0, 1]. */
export function buyingPressure(state: SymbolState): number {
  const total = state.buyVolume + state.sellVolume;
  return total > 0 ? state.buyVolume / total : 0.5;
}

/** Selling pressure as fraction of total classified volume [0, 1]. */
export function sellingPressure(state: SymbolState): number {
  const total = state.buyVolume + state.sellVolume;
  return total > 0 ? state.sellVolume / total : 0.5;
}

/** Detect bearish delta divergence: new price high without new delta high. */
export function hasDeltaDivergence(state: SymbolState, price: number): boolean {
  if (state.sessionHigh <= 0 || state.sessionDeltaHigh <= -Infinity) return false;
  const newPriceHigh = price >= state.sessionHigh;
  const deltaNotConfirming = state.cumulativeDelta < state.sessionDeltaHigh * 0.9;
  return newPriceHigh && deltaNotConfirming;
}
