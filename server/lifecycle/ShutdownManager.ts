import type { Server as HttpServer } from "http";
import { ServerConfig } from "../config";
import { Logger } from "../logging";
import { flushAllPersistence, PersistenceBundle } from "../persistence";
import { ServiceContainer } from "../services";

export interface ShutdownDeps {
  config: ServerConfig;
  services: ServiceContainer;
  httpServer: HttpServer;
  logger: Logger;
  onComplete?: () => void;
}

let shuttingDown = false;

/**
 * Graceful shutdown orchestrator.
 *
 * Order: WebSocket → EventBus listeners → Sierra disconnect → Scanner stop
 *        → persistence flush → HTTP close → exit
 */
export async function registerGracefulShutdown(deps: ShutdownDeps): Promise<void> {
  const { logger } = deps;

  const shutdown = async (signal: string, error?: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (error) {
      logger.error("Shutdown triggered by fatal error", { signal, error: String(error) });
    } else {
      logger.info("Graceful shutdown initiated", { signal });
    }

    const forceTimer = setTimeout(() => {
      logger.error("Shutdown timeout exceeded — forcing exit");
      process.exit(1);
    }, deps.config.gracefulShutdownTimeoutMs);
    forceTimer.unref();

    try {
      deps.services.realtimeServer.close();
      logger.info("WebSocket server stopped");

      deps.services.realtimeHub.stop();
      logger.info("Realtime hub stopped");

      deps.services.scannerBridge.stop();
      deps.services.marketCache.stop();
      logger.info("EventBus subscribers stopped");

      deps.services.marketProvider.stop();
      logger.info("Market provider stopped");

      deps.services.scannerEngine.stop();
      logger.info("Scanner engine stopped");

      deps.services.baselineStore.refresh();
      await deps.services.baselineStore.save();
      await flushAllPersistence(deps.services.persistence);
      logger.info("Persistence flushed");

      await closeHttpServer(deps.httpServer);
      logger.info("HTTP server closed");

      clearTimeout(forceTimer);
      deps.onComplete?.();
      process.exit(error ? 1 : 0);
    } catch (shutdownError) {
      logger.error("Shutdown failed", { error: String(shutdownError) });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: String(reason) });
    void shutdown("unhandledRejection", reason);
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error: error.message, stack: error.stack });
    void shutdown("uncaughtException", error);
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export type { PersistenceBundle };
