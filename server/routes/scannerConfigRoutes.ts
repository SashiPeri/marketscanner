import { Router } from "express";
import { ScannerConfigController } from "../controllers/ScannerConfigController";
import { asyncHandler } from "../middleware/asyncHandler";

export function createScannerConfigRoutes(ctrl: ScannerConfigController): Router {
  const router = Router();

  // Scanner config (selected indicators, filters, sort)
  router.get("/scanner/config", asyncHandler(ctrl.getConfig));
  router.put("/scanner/config", asyncHandler(ctrl.updateConfig));

  // Watchlist / universe management
  router.get("/scanner/watchlist", asyncHandler(ctrl.getWatchlist));
  router.post("/scanner/watchlist/symbols", asyncHandler(ctrl.addSymbol));
  router.post("/scanner/watchlist/bulk", asyncHandler(ctrl.bulkAddSymbols));
  router.delete("/scanner/watchlist/symbols/:symbol", asyncHandler(ctrl.removeSymbol));

  // Entitlement
  router.get("/scanner/entitlement", asyncHandler(ctrl.getEntitlement));

  return router;
}
