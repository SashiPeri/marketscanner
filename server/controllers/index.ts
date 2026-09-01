import { GeminiController } from "./GeminiController";
import { JournalController } from "./JournalController";
import { MarketController } from "./MarketController";
import { ScannerConfigController } from "./ScannerConfigController";
import { SierraBridgeController } from "./SierraBridgeController";
import { ServiceContainer } from "../services";

export function createControllers(services: ServiceContainer) {
  return {
    marketController: new MarketController(services.marketDataService),
    sierraBridgeController: new SierraBridgeController(services.sierraBridgeService),
    geminiController: new GeminiController(services.geminiService, services.marketProvider),
    scannerConfigController: new ScannerConfigController(
      services.scannerConfigRepo,
      services.watchlistRepo,
      services.entitlementService,
    ),
    journalController: new JournalController(services.journalService),
  };
}
