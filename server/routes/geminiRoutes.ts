import { Router } from "express";
import { GeminiController } from "../controllers/GeminiController";
import { asyncHandler } from "../middleware/asyncHandler";

export function createGeminiRoutes(geminiController: GeminiController): Router {
  const router = Router();

  router.post("/gemini/analyze", asyncHandler(geminiController.analyze));

  return router;
}
