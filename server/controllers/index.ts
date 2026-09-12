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
      services.conditionSetRepo,
      services.scannerEngine,
      services.conditionEvaluator,
      services.studyValueStore,
    ),
    journalController: new JournalController(services.journalService),
  };
}
