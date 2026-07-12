import express from "express";
import { createServer as createHttpServer, Server as HttpServer } from "http";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { ConfigValidationError, loadConfig } from "./config";
import { createControllers } from "./controllers";
import { createHealthRoutes } from "./health";
import { registerGracefulShutdown } from "./lifecycle";
import { createLogger } from "./logging";
import { createMetricsRoutes } from "./metrics";
import { errorHandler } from "./middleware/errorHandler";
import { createApiRoutes } from "./routes";
import { createServices, ServiceContainer } from "./services";

dotenv.config();

const bootstrapLogger = createLogger("bootstrap");

async function createApp(): Promise<{
  app: express.Express;
  services: ServiceContainer;
  httpServer: HttpServer;
}> {
  const config = loadConfig();
  const app = express();
  const services = await createServices(config);
  const controllers = createControllers(services);

  app.use(express.json());
  app.use("/api", createApiRoutes(controllers));
  app.use(createHealthRoutes(services.healthService));
  app.use(
    createMetricsRoutes(services.metricsService, () => {
      const hubStats = services.realtimeHub.getStats();
      return {
        subscriptions: hubStats.totalSubscriptions,
        connectedClients: hubStats.totalClients,
        cacheSize: services.marketCache.size(),
        batchCoalesced: hubStats.updatesCoalesced,
        batchesPublished: hubStats.batchesPublished,
      };
    }),
  );

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

  const httpServer = createHttpServer(app);
  services.realtimeServer.attach(httpServer);
  services.websocketAttached = true;

  return { app, services, httpServer };
}

async function startServer(): Promise<void> {
  try {
    const { services, httpServer } = await createApp();
    const { config } = services;

    await registerGracefulShutdown({
      config,
      services,
      httpServer,
      logger: services.logger.child({ component: "shutdown" }),
    });

    httpServer.listen(config.port, "0.0.0.0", () => {
      services.logger.info("Market scanner server started", {
        port: config.port,
        nodeEnv: config.nodeEnv,
        provider: config.marketProvider,
        wsPath: "/ws",
      });
    });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      bootstrapLogger.error("Configuration validation failed", { error: error.message });
    } else {
      bootstrapLogger.error("Failed to start server", { error: String(error) });
    }
    process.exit(1);
  }
}

startServer();
