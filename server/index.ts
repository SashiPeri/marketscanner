import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { loadConfig } from "./config/env";
import { createControllers } from "./controllers";
import { errorHandler } from "./middleware/errorHandler";
import { createApiRoutes } from "./routes";
import { createServices } from "./services";
import { logger } from "./utils/logger";

dotenv.config();

async function createApp() {
  const config = loadConfig();
  const app = express();
  const services = createServices(config.geminiApiKey);
  const controllers = createControllers(services);

  app.use(express.json());
  app.use("/api", createApiRoutes(controllers));

  if (config.nodeEnv !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(errorHandler);

  return { app, config };
}

async function startServer() {
  const { app, config } = await createApp();

  app.listen(config.port, "0.0.0.0", () => {
    logger.info(`Bloomberg Market Scanner server running on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});
