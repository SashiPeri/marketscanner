import { Router } from "express";
import { GeminiController } from "../controllers/GeminiController";
import { JournalController } from "../controllers/JournalController";
import { MarketController } from "../controllers/MarketController";
import { ScannerConfigController } from "../controllers/ScannerConfigController";
import { SierraBridgeController } from "../controllers/SierraBridgeController";
import { createGeminiRoutes } from "./geminiRoutes";
import { createJournalRoutes } from "./journalRoutes";
import { createMarketRoutes } from "./marketRoutes";
import { createScannerConfigRoutes } from "./scannerConfigRoutes";
import { createSierraBridgeRoutes } from "./sierraBridgeRoutes";

export interface ApiControllers {
  marketController: MarketController;
  sierraBridgeController: SierraBridgeController;
  geminiController: GeminiController;
  scannerConfigController: ScannerConfigController;
  journalController: JournalController;
}

export function createApiRoutes(controllers: ApiControllers): Router {
  const router = Router();

  router.use(createMarketRoutes(controllers.marketController));
  router.use(createSierraBridgeRoutes(controllers.sierraBridgeController));
  router.use(createGeminiRoutes(controllers.geminiController));
  router.use(createScannerConfigRoutes(controllers.scannerConfigController));
  router.use(createJournalRoutes(controllers.journalController));

  return router;
}
