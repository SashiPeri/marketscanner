import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error("Unhandled API error", { error: error.message, stack: error.stack });
  res.status(500).json({
    success: false,
    error: error.message || "Internal server error.",
  });
}
