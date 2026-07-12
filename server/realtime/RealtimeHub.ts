import { EventBus } from "../events";
import { Logger } from "../logging";
import { MetricsService } from "../metrics";
import { mapScannerResultToMarketData } from "../scanner";
import { MarketData } from "../types/market";
import { BatchPublisher } from "./BatchPublisher";
import { ConnectionManager } from "./ConnectionManager";
import { Serializer } from "./Serializer";
import {
  DEFAULT_REALTIME_CONFIG,
  HubStats,
  RealtimeConfig,
  ServerMessage,
} from "./types";

/**
 * Publish/subscribe hub between the EventBus and WebSocket clients.
 *
 * OPTIMIZATION: filterBuffer reused per connection during batch fan-out.
 */
export class RealtimeHub {
  private readonly connections = new Map<string, ConnectionManager>();
  private readonly batchPublisher: BatchPublisher;
  private readonly serializer = new Serializer("json");
  /** Reused per-connection filter buffer — avoids .filter() array allocation. */
  private readonly filterBuffer: MarketData[] = [];
  private unsubscribers: Array<() => void> = [];
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private batchesPublished = 0;

  constructor(
    private readonly eventBus: EventBus,
    private readonly metrics: MetricsService,
    private readonly logger: Logger,
    private readonly config: RealtimeConfig = DEFAULT_REALTIME_CONFIG,
  ) {
    this.batchPublisher = new BatchPublisher(config.batchIntervalMs, (updates, sequence) => {
      const start = performance.now();
      this.distributeBatch(updates, sequence);
      this.metrics.recordBatchLatency(performance.now() - start);
      this.metrics.recordMessage();
    });
  }

  start(): void {
    this.batchPublisher.start();

    this.unsubscribers.push(
      this.eventBus.subscribe("scanner:result", (result) => {
        const marketData = mapScannerResultToMarketData(result);
        this.batchPublisher.enqueue(marketData);
      }),
    );

    this.staleCheckTimer = setInterval(() => this.pruneStaleConnections(), 15_000);
    this.logger.info("Realtime hub started", { batchIntervalMs: this.config.batchIntervalMs });
  }

  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }

    this.batchPublisher.stop();

    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.logger.info("Realtime hub stopped");
  }

  registerConnection(connection: ConnectionManager): void {
    this.connections.set(connection.connectionId, connection);

    const welcome: ServerMessage = {
      type: "connected",
      connectionId: connection.connectionId,
      serverTime: new Date().toISOString(),
    };
    connection.send(welcome);
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  getStats(): HubStats {
    let totalSubscriptions = 0;
    for (const conn of this.connections.values()) {
      totalSubscriptions += conn.subscriptions.count();
    }

    return {
      totalClients: this.connections.size,
      totalSubscriptions,
      batchesPublished: this.batchesPublished,
      updatesCoalesced: this.batchPublisher.getCoalescedCount(),
    };
  }

  getPendingBatchSize(): number {
    return this.batchPublisher.getPendingSize();
  }

  getConnectionStats(): ReturnType<ConnectionManager["getStats"]>[] {
    return Array.from(this.connections.values()).map((c) => c.getStats());
  }

  getSerializer(): Serializer {
    return this.serializer;
  }

  private distributeBatch(updates: MarketData[], sequence: number): void {
    if (this.connections.size === 0) return;

    this.batchesPublished += 1;
    const timestamp = new Date().toISOString();

    for (const conn of this.connections.values()) {
      // OPTIMIZATION: manual filter into reused buffer instead of updates.filter().
      this.filterBuffer.length = 0;
      for (const update of updates) {
        if (conn.subscriptions.matchesSymbol(update.symbol)) {
          this.filterBuffer.push(update);
        }
      }

      if (this.filterBuffer.length === 0) continue;

      const message: ServerMessage = {
        type: "batch",
        channel: "scanner",
        updates: this.filterBuffer.slice(),
        timestamp,
        sequence,
      };

      const wsStart = performance.now();
      conn.send(message);
      this.metrics.recordWebsocketLatency(performance.now() - wsStart);
    }
  }

  private pruneStaleConnections(): void {
    const now = Date.now();
    for (const conn of this.connections.values()) {
      if (conn.isStale(now)) {
        this.logger.info("Closing stale connection", { connectionId: conn.connectionId });
        conn.close();
        this.connections.delete(conn.connectionId);
      }
    }
  }
}
