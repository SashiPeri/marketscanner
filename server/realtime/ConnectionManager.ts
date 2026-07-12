import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import { Serializer } from "./Serializer";
import { SubscriptionManager } from "./SubscriptionManager";
import {
  ClientMessage,
  ConnectionStats,
  DEFAULT_REALTIME_CONFIG,
  RealtimeConfig,
  ServerMessage,
} from "./types";

type OutboundEntry = { payload: string; sequence: number };

/**
 * Manages a single WebSocket client lifecycle.
 *
 * Backpressure: each connection has a bounded outbound queue. When full,
 * the oldest batch is dropped — never the newest. send() never blocks
 * the BatchPublisher or EventBus.
 */
export class ConnectionManager {
  readonly connectionId: string;
  readonly subscriptions = new SubscriptionManager();
  readonly connectedAt: string;

  private lastActivityAt: string;
  private outboundQueue: OutboundEntry[] = [];
  private isSending = false;
  private batchesSent = 0;
  private batchesDropped = 0;
  private closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly serializer: Serializer,
    private readonly config: RealtimeConfig = DEFAULT_REALTIME_CONFIG,
    private readonly onClose?: (connectionId: string) => void,
  ) {
    this.connectionId = randomUUID();
    this.connectedAt = new Date().toISOString();
    this.lastActivityAt = this.connectedAt;
  }

  send(message: ServerMessage): void {
    if (this.closed || this.socket.readyState !== 1) return;

    const payload = this.serializer.serialize(message) as string;
    const sequence = message.type === "batch" ? message.sequence : 0;

    if (this.outboundQueue.length >= this.config.maxOutboundQueue) {
      this.outboundQueue.shift();
      this.batchesDropped += 1;
    }

    this.outboundQueue.push({ payload, sequence });
    this.drainQueue();
  }

  handleMessage(raw: string | Buffer): void {
    this.lastActivityAt = new Date().toISOString();
    const message = this.serializer.deserialize<ClientMessage>(raw);
    if (!message) {
      this.send({ type: "error", message: "Invalid message format" });
      return;
    }

    switch (message.type) {
      case "ping":
        this.send({ type: "pong", serverTime: new Date().toISOString() });
        break;
      case "subscribe":
        this.subscriptions.subscribe(message.subscription);
        break;
      case "unsubscribe":
        this.subscriptions.unsubscribe(message.subscription);
        break;
    }
  }

  isStale(now: number): boolean {
    const lastMs = new Date(this.lastActivityAt).getTime();
    return now - lastMs > this.config.staleConnectionMs;
  }

  touch(): void {
    this.lastActivityAt = new Date().toISOString();
  }

  getStats(): ConnectionStats {
    return {
      connectionId: this.connectionId,
      connectedAt: this.connectedAt,
      lastActivityAt: this.lastActivityAt,
      subscriptions: this.subscriptions.getSubscriptions(),
      outboundQueueDepth: this.outboundQueue.length,
      batchesSent: this.batchesSent,
      batchesDropped: this.batchesDropped,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.subscriptions.unsubscribeAll();
    this.outboundQueue = [];

    if (this.socket.readyState === 1 || this.socket.readyState === 0) {
      this.socket.close();
    }

    this.onClose?.(this.connectionId);
  }

  private drainQueue(): void {
    if (this.isSending || this.outboundQueue.length === 0) return;
    if (this.socket.readyState !== 1) return;

    this.isSending = true;
    const entry = this.outboundQueue.shift()!;

    this.socket.send(entry.payload, (err) => {
      this.isSending = false;
      if (!err) {
        this.batchesSent += 1;
        this.lastActivityAt = new Date().toISOString();
      }
      if (this.outboundQueue.length > 0) {
        this.drainQueue();
      }
    });
  }
}
