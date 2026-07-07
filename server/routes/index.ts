import { Router } from "express";
import { GeminiController } from "../controllers/GeminiController";
import { MarketController } from "../controllers/MarketController";
import { SierraBridgeController } from "../controllers/SierraBridgeController";
import { createGeminiRoutes } from "./geminiRoutes";
import { createMarketRoutes } from "./marketRoutes";
import { createSierraBridgeRoutes } from "./sierraBridgeRoutes";

export interface ApiControllers {
  marketController: MarketController;
  sierraBridgeController: SierraBridgeController;
  geminiController: GeminiController;
}

export function createApiRoutes(controllers: ApiControllers): Router {
  const router = Router();

  router.use(createMarketRoutes(controllers.marketController));
  router.use(createSierraBridgeRoutes(controllers.sierraBridgeController));
  router.use(createGeminiRoutes(controllers.geminiController));

  return router;
}
