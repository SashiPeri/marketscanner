import { GeminiService } from "../gemini/GeminiService";
import { MockMarketProvider } from "../providers/MockMarketProvider";
import { MarketProvider } from "../providers/MarketProvider";
import { MarketDataService } from "./MarketDataService";
import { SierraBridgeService } from "./SierraBridgeService";

export interface ServiceContainer {
  marketProvider: MarketProvider;
  marketDataService: MarketDataService;
  sierraBridgeService: SierraBridgeService;
  geminiService: GeminiService;
}

export function createServices(geminiApiKey?: string): ServiceContainer {
  const marketProvider = new MockMarketProvider();
  marketProvider.start();

  return {
    marketProvider,
    marketDataService: new MarketDataService(marketProvider),
    sierraBridgeService: new SierraBridgeService(marketProvider),
    geminiService: new GeminiService(geminiApiKey),
  };
}
