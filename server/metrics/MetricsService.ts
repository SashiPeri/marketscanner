import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";

export interface MetricsSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  ticksPerSecond: number;
  messagesPerSecond: number;
  scannerLatencyMs: { p50: number; p95: number; max: number };
  batchLatencyMs: { p50: number; p95: number; max: number };
  websocketLatencyMs: { p50: number; p95: number; max: number };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
  };
  cpu: {
    userMicros: number;
    systemMicros: number;
  };
  subscriptions: number;
  connectedClients: number;
  cacheSize: number;
  scannerThroughput: number;
  batchCoalesced: number;
  batchesPublished: number;
}

/**
 * In-process metrics collector.
 * JSON output today; Prometheus exposition format can wrap this later.
 */
export class MetricsService {
  private readonly scannerLatencies: number[] = [];
  private readonly batchLatencies: number[] = [];
  private readonly websocketLatencies: number[] = [];
  private tickCount = 0;
  private messageCount = 0;
  private scannerResults = 0;
  private lastSampleAt = Date.now();
  private lastCpuUsage = process.cpuUsage();
  private readonly startedAt = Date.now();
  private readonly maxSamples = 1000;

  recordTick(): void {
    this.tickCount += 1;
  }

  recordMessage(): void {
    this.messageCount += 1;
  }

  recordScannerLatency(ms: number): void {
    this.scannerResults += 1;
    this.pushSample(this.scannerLatencies, ms);
  }

  recordBatchLatency(ms: number): void {
    this.pushSample(this.batchLatencies, ms);
  }

  recordWebsocketLatency(ms: number): void {
    this.pushSample(this.websocketLatencies, ms);
  }

  getSnapshot(extras: {
    subscriptions: number;
    connectedClients: number;
    cacheSize: number;
    batchCoalesced: number;
    batchesPublished: number;
  }): MetricsSnapshot {
    const now = Date.now();
    const elapsedSec = Math.max(1, (now - this.lastSampleAt) / 1000);
    const cpuDelta = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastSampleAt = now;

    const mem = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((now - this.startedAt) / 1000),
      ticksPerSecond: round(this.tickCount / elapsedSec),
      messagesPerSecond: round(this.messageCount / elapsedSec),
      scannerLatencyMs: percentileStats(this.scannerLatencies),
      batchLatencyMs: percentileStats(this.batchLatencies),
      websocketLatencyMs: percentileStats(this.websocketLatencies),
      memory: {
        heapUsedMb: roundMb(mem.heapUsed),
        heapTotalMb: roundMb(mem.heapTotal),
        rssMb: roundMb(mem.rss),
        externalMb: roundMb(mem.external),
      },
      cpu: {
        userMicros: cpuDelta.user,
        systemMicros: cpuDelta.system,
      },
      subscriptions: extras.subscriptions,
      connectedClients: extras.connectedClients,
      cacheSize: extras.cacheSize,
      scannerThroughput: round(this.scannerResults / elapsedSec),
      batchCoalesced: extras.batchCoalesced,
      batchesPublished: extras.batchesPublished,
    };
  }

  resetIntervalCounters(): void {
    this.tickCount = 0;
    this.messageCount = 0;
    this.scannerResults = 0;
    this.lastSampleAt = Date.now();
  }

  private pushSample(buffer: number[], value: number): void {
    buffer.push(value);
    if (buffer.length > this.maxSamples) {
      buffer.shift();
    }
  }
}

export function createMetricsRoutes(metricsService: MetricsService, getExtras: () => {
  subscriptions: number;
  connectedClients: number;
  cacheSize: number;
  batchCoalesced: number;
  batchesPublished: number;
}): Router {
  const router = Router();

  router.get(
    "/metrics",
    asyncHandler(async (_req, res) => {
      const snapshot = metricsService.getSnapshot(getExtras());
      metricsService.resetIntervalCounters();
      res.json(snapshot);
    }),
  );

  return router;
}

function percentileStats(samples: number[]): { p50: number; p95: number; max: number } {
  if (samples.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function roundMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
