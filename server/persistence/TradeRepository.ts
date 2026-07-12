import { TradePrint } from "../types/domain";
import { PersistedTrade, RepositoryFlushResult } from "./types";

export interface TradeRepository {
  save(trade: TradePrint): void;
  get(symbol: string, limit?: number): PersistedTrade[];
  flush(): Promise<RepositoryFlushResult>;
  size(): number;
}
