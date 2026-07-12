import { OrderBookSnapshot } from "../types/domain";
import { safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Order-flow metrics from depth-of-market snapshots.
 * Bid/ask aggression approximated by relative size at the inside market.
 */
export function updateOrderFlow(state: SymbolState, book: OrderBookSnapshot): void {
  state.lastOrderBook = book;

  const bestBid = book.bids[0];
  const bestAsk = book.asks[0];

  state.bestBidSize = bestBid?.size ?? 0;
  state.bestAskSize = bestAsk?.size ?? 0;

  const totalTop = state.bestBidSize + state.bestAskSize;
  if (totalTop > 0) {
    state.bidAggression = safeDivide(state.bestBidSize, totalTop, 0.5);
    state.askAggression = safeDivide(state.bestAskSize, totalTop, 0.5);
  }
}

/** Book imbalance: positive = bid-heavy, negative = ask-heavy. Range [-1, 1]. */
export function bookImbalance(state: SymbolState): number {
  const total = state.bestBidSize + state.bestAskSize;
  return total > 0 ? (state.bestBidSize - state.bestAskSize) / total : 0;
}
