import { MarketData, SierraConfig, SierraSyncRequest } from "../types/market";

export interface MarketProvider {
  start(): void;
  stop(): void;
  getMarkets(): MarketData[];
  getSierraConfig(): SierraConfig;
  syncSierra(params: SierraSyncRequest): { sierraConfig: SierraConfig; markets: MarketData[] };
  disconnectSierra(): SierraConfig;
}
