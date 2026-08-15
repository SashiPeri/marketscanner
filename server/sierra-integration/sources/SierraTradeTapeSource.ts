import {
  CompletedTrade,
  CompletedTradeListener,
  CompletedTradeQuery,
  Unsubscribe,
} from "../types";

/**
 * Market tape — completed exchange trades (not account fills).
 * Recommended transport: DTC live TradeUpdate.
 */
export interface SierraTradeTapeSource {
  subscribeCompletedTrades(
    symbol: string,
    listener: CompletedTradeListener,
  ): Unsubscribe;

  getCompletedTrades(query: CompletedTradeQuery): Promise<CompletedTrade[]>;
}
