import { ServerConfig } from "../config";
import { EventBus } from "../events";
import { MarketProvider } from "../providers/MarketProvider";
import { RealtimeHub, RealtimeServer } from "../realtime";
import { ScannerEngine } from "../scanner";
import { MarketCacheService } from "../services/MarketCacheService";
import { PersistenceBundle } from "../persistence";

export interface HealthSnapshot {
  status: "healthy" | "degraded" | "unhealthy";
  uptimeSeconds: number;
  version: string;
  buildTimestamp: string;
  providerType: string;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  websocket: {
    running: boolean;
    connectedClients: number;
    totalSubscriptions: number;
    batchesPublished: number;
    updatesCoalesced: number;
  };
  scanner: {
    running: boolean;
    symbolsTracked: number;
    resultsCount: number;
  };
  sierra: {
    status: string;
    connected: boolean;
  };
  queues: {
    batchPending: number;
    outboundQueues: number;
  };
  timestamp: string;
}

export interface HealthServiceDeps {
  config: ServerConfig;
  startedAt: number;
  scannerEngine: ScannerEngine;
  marketCache: MarketCacheService;
  marketProvider: MarketProvider;
  realtimeHub: RealtimeHub;
  realtimeServer: RealtimeServer;
  eventBus: EventBus;
  persistence: PersistenceBundle;
  websocketAttached: () => boolean;
}

export class HealthService {
  constructor(private readonly deps: HealthServiceDeps) {}

  getLive(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  getReady(): { ready: boolean; checks: Record<string, boolean>; timestamp: string } {
    const checks = {
      scanner: this.deps.scannerEngine.isRunning(),
      eventBus: this.deps.eventBus.channels().length >= 0,
      cache: this.deps.marketCache.size() >= 0,
      websocket: this.deps.websocketAttached(),
    };

    const ready = Object.values(checks).every(Boolean);
    return { ready, checks, timestamp: new Date().toISOString() };
  }

  getHealth(): HealthSnapshot {
    const mem = process.memoryUsage();
    const hubStats = this.deps.realtimeHub.getStats();
    const connStats = this.deps.realtimeHub.getConnectionStats();
    const sierraConfig = this.deps.marketProvider.getSierraConfig();

    const outboundQueues = connStats.reduce((sum, c) => sum + c.outboundQueueDepth, 0);
    const scannerRunning = this.deps.scannerEngine.isRunning();

    let status: HealthSnapshot["status"] = "healthy";
    if (!scannerRunning || !this.deps.websocketAttached()) status = "degraded";

    return {
      status,
      uptimeSeconds: Math.floor((Date.now() - this.deps.startedAt) / 1000),
      version: this.deps.config.version,
      buildTimestamp: this.deps.config.buildTimestamp,
      providerType: this.deps.config.marketProvider,
      memory: {
        heapUsedMb: roundMb(mem.heapUsed),
        heapTotalMb: roundMb(mem.heapTotal),
        rssMb: roundMb(mem.rss),
      },
      websocket: {
        running: this.deps.websocketAttached(),
        connectedClients: hubStats.totalClients,
        totalSubscriptions: hubStats.totalSubscriptions,
        batchesPublished: hubStats.batchesPublished,
        updatesCoalesced: hubStats.updatesCoalesced,
      },
      scanner: {
        running: scannerRunning,
        symbolsTracked: this.deps.scannerEngine.getSymbolCount(),
        resultsCount: this.deps.scannerEngine.getAllResults().length,
      },
      sierra: {
        status: sierraConfig.status,
        connected: sierraConfig.status === "CONNECTED",
      },
      queues: {
        batchPending: this.deps.realtimeHub.getPendingBatchSize(),
        outboundQueues,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

function roundMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
