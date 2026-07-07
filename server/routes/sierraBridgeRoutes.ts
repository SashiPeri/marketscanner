import { Router } from "express";
import { SierraBridgeController } from "../controllers/SierraBridgeController";
import { asyncHandler } from "../middleware/asyncHandler";

export function createSierraBridgeRoutes(sierraBridgeController: SierraBridgeController): Router {
  const router = Router();

  router.post("/sierra-bridge/sync", asyncHandler(sierraBridgeController.sync));
  router.post("/sierra-bridge/disconnect", asyncHandler(sierraBridgeController.disconnect));

  return router;
}
