import { Router } from "express";
import { JournalController } from "../controllers/JournalController";
import { asyncHandler } from "../middleware/asyncHandler";

export function createJournalRoutes(ctrl: JournalController): Router {
  const router = Router();

  router.post("/journal/trades", asyncHandler(ctrl.recordTrade));
  router.get("/journal/trades", asyncHandler(ctrl.listTrades));
  router.get("/journal/trades/summary", asyncHandler(ctrl.getSummary));
  router.get("/journal/trades/:id", asyncHandler(ctrl.getTrade));
  router.delete("/journal/trades/:id", asyncHandler(ctrl.deleteTrade));

  return router;
}
