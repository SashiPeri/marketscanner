import { EventEmitter } from "events";
import { Server, Socket, createServer } from "net";
import { Logger } from "../../logging";
import { AcsilMessage, parseAcsilLine } from "./acsilProtocol";

const MAX_LINE_LENGTH = 64 * 1024;
const MAX_BUFFER_LENGTH = 1024 * 1024;

export declare interface AcsilTcpFeed {
  on(event: "tick", listener: (message: AcsilMessage) => void): this;
  emit(event: "tick", message: AcsilMessage): boolean;
}

/**
 * TCP listener for acsil/MarketScannerBridge.cpp studies. Studies dial out
 * from the Windows host, so this side only accepts — reachable from the
 * host at the VM's guest IP (10.0.2.15 in VirtualBox NAT). Multiple charts
 * (ES, corn, YM, …) share one connection or open their own; messages
 * demultiplex by their `sym` field.
 */
export class AcsilTcpFeed extends EventEmitter {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  private lastMessageAt: string | undefined;
  private droppedLines = 0;

  constructor(
    private readonly port: number,
    private readonly logger: Logger,
  ) {
    super();
  }

  start(): void {
    if (this.server) return;
    const server = createServer((socket) => this.handleSocket(socket));
    server.on("error", (error) => {
      this.logger.error("ACSIL feed server error", { message: (error as Error).message });
    });
    server.listen(this.port, "0.0.0.0", () => {
      this.logger.info(`ACSIL feed listening on 0.0.0.0:${this.port}`);
    });
    this.server = server;
  }

  stop(): void {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server?.close();
    this.server = null;
  }

  /** Resolves with the bound port once the listener is up. */
  waitForListening(): Promise<number> {
    const server = this.server;
    if (!server) return Promise.reject(new Error("Feed server is not started."));
    const existing = server.address();
    if (existing && typeof existing === "object") return Promise.resolve(existing.port);
    return new Promise<number>((resolve, reject) => {
      server.once("listening", () => {
        const address = server.address();
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Feed server has no address."));
      });
      server.once("error", (error) => reject(error));
    });
  }

  getConnectionCount(): number {
    return this.sockets.size;
  }

  getLastMessageAt(): string | undefined {
    return this.lastMessageAt;
  }

  private handleSocket(socket: Socket): void {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.info("ACSIL study connected", { remote });
    this.sockets.add(socket);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_BUFFER_LENGTH) {
        // Never let a misbehaving sender grow memory unbounded.
        buffer = "";
        this.droppedLines += 1;
        this.logger.warn("ACSIL feed buffer overflow — reset", { remote });
        return;
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        this.handleLine(line, remote);
        newline = buffer.indexOf("\n");
      }
      if (buffer.length > MAX_LINE_LENGTH) {
        buffer = "";
        this.droppedLines += 1;
      }
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.logger.info("ACSIL study disconnected", { remote });
    });
    socket.on("error", () => {
      this.sockets.delete(socket);
    });
  }

  private handleLine(line: string, remote: string): void {
    if (!line.trim()) return;
    const message = parseAcsilLine(line);
    if (!message) {
      this.droppedLines += 1;
      this.logger.debug("ACSIL feed dropped invalid line", { remote });
      return;
    }
    this.lastMessageAt = new Date().toISOString();
    this.emit("tick", message);
  }
}
