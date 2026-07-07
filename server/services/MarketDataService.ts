import { MarketProvider } from "../providers/MarketProvider";
import { MarketDataResponse } from "../types/market";

export class MarketDataService {
  constructor(private readonly marketProvider: MarketProvider) {}

  getMarketData(): MarketDataResponse {
    return {
      timestamp: new Date().toISOString(),
      markets: this.marketProvider.getMarkets(),
      sierraConfig: this.marketProvider.getSierraConfig(),
    };
  }
}
