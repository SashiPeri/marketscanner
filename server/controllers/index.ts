import { GeminiController } from "./GeminiController";
import { MarketController } from "./MarketController";
import { SierraBridgeController } from "./SierraBridgeController";
import { ServiceContainer } from "../services";

export function createControllers(services: ServiceContainer) {
  return {
    marketController: new MarketController(services.marketDataService),
    sierraBridgeController: new SierraBridgeController(services.sierraBridgeService),
    geminiController: new GeminiController(services.geminiService, services.marketProvider),
  };
}
