import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { Logger } from "../logging";
import { ConnectionManager } from "./ConnectionManager";
import { RealtimeHub } from "./RealtimeHub";
import { DEFAULT_REALTIME_CONFIG, RealtimeConfig } from "./types";

/**
 * Native WebSocket transport layer.
 * Decoupled from Express — attaches to the shared HTTP server.
 */
export class RealtimeServer {
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly hub: RealtimeHub,
    private readonly logger: Logger,
    private readonly config: RealtimeConfig = DEFAULT_REALTIME_CONFIG,
  ) {}

  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: this.config.path,
    });

    this.wss.on("connection", (socket: WebSocket) => {
      this.handleConnection(socket);
    });

    this.wss.on("error", (error) => {
      this.logger.error("WebSocket server error", { error: String(error) });
    });

    this.logger.info("WebSocket server listening", { path: this.config.path });
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private handleConnection(socket: WebSocket): void {
    const serializer = this.hub.getSerializer();
    const connection = new ConnectionManager(
      socket,
      serializer,
      this.config,
      (connectionId) => {
        this.hub.removeConnection(connectionId);
      },
    );

    this.hub.registerConnection(connection);

    socket.on("message", (data) => {
      connection.handleMessage(data as Buffer);
    });

    socket.on("close", () => {
      connection.close();
      this.hub.removeConnection(connection.connectionId);
    });

    socket.on("error", (error) => {
      this.logger.error("WebSocket connection error", {
        connectionId: connection.connectionId,
        error: String(error),
      });
      connection.close();
      this.hub.removeConnection(connection.connectionId);
    });

    // Default subscription: receive all symbols until client specifies otherwise.
    connection.subscriptions.subscribe({ kind: "all" });
  }
}
