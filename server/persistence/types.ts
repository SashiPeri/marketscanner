import {
  MarketSnapshot,
  ScannerSignal,
  SessionStatistics,
  TradePrint,
} from "../types/domain";

export interface PersistedMarketSnapshot extends MarketSnapshot {
  id: string;
  persistedAt: string;
}

export interface PersistedTrade extends TradePrint {
  id: string;
  persistedAt: string;
}

export interface PersistedScannerSignal extends ScannerSignal {
  persistedAt: string;
}

export interface PersistedSession extends SessionStatistics {
  id: string;
  persistedAt: string;
}

export interface RepositoryFlushResult {
  flushed: number;
  durationMs: number;
}
