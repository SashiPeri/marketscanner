import { MarketSnapshot } from "../types/domain";
import { PersistedMarketSnapshot, RepositoryFlushResult } from "./types";

export interface MarketSnapshotRepository {
  save(snapshot: MarketSnapshot): void;
  get(symbol: string, limit?: number): PersistedMarketSnapshot[];
  getLatest(symbol: string): PersistedMarketSnapshot | undefined;
  flush(): Promise<RepositoryFlushResult>;
  size(): number;
}
