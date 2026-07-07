import { Router } from "express";
import { MarketController } from "../controllers/MarketController";
import { asyncHandler } from "../middleware/asyncHandler";

export function createMarketRoutes(marketController: MarketController): Router {
  const router = Router();

  router.get("/market-data", asyncHandler(marketController.getMarketData));

  return router;
}
