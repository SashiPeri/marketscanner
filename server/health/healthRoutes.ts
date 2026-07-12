import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { HealthService } from "./HealthService";

export function createHealthRoutes(healthService: HealthService): Router {
  const router = Router();

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json(healthService.getHealth());
    }),
  );

  router.get(
    "/health/live",
    asyncHandler(async (_req, res) => {
      res.json(healthService.getLive());
    }),
  );

  router.get(
    "/health/ready",
    asyncHandler(async (_req, res) => {
      const ready = healthService.getReady();
      res.status(ready.ready ? 200 : 503).json(ready);
    }),
  );

  return router;
}
