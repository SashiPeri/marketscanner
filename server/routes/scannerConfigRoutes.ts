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

  // Server-side scan conditions
  router.get("/scanner/condition-sets", asyncHandler(ctrl.getConditionSets));
  router.put("/scanner/condition-sets", asyncHandler(ctrl.replaceConditionSets));
  router.get("/scanner/condition-matches", asyncHandler(ctrl.getConditionMatches));
  router.get("/scanner/study-values", asyncHandler(ctrl.getStudyValues));
  router.post("/scanner/study-values", asyncHandler(ctrl.upsertStudyValues));

  return router;
}
