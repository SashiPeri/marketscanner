import { Logger } from "../../logging";
import { ScannerEngine } from "../../scanner";
import { MarketCacheService } from "../../services/MarketCacheService";
import {
  ConnectionStatus,
  InstrumentIdentity,
  MarketSnapshot,
  OrderBookLevel,
  OrderBookSnapshot,
  TradePrint,
} from "../../types/domain";
import { MarketData, SierraConfig, SierraSyncRequest, SymbolFeedState } from "../../types/market";
import { loadCustomSymbols, saveCustomSymbols } from "../customSymbolsStore";
import { MarketProvider } from "../MarketProvider";
import { AcsilMessage } from "./acsilProtocol";
import { AcsilTcpFeed } from "./AcsilTcpFeed";

const MAX_DEPTH_LEVELS = 10;

function isoFromMillis(ms: number): string {
  return new Date(ms).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * MarketProvider fed by the in-process ACSIL bridge study
 * (acsil/MarketScannerBridge.cpp) instead of the DTC protocol server.
 *
 * Same normalized outputs as every other provider — TradePrint,
 * MarketSnapshot, OrderBookSnapshot into the ScannerEngine — so the
 * scanner, cache, and UI behave identically regardless of transport.
 * Symbols are whatever the customer typed and opened charts for (ES,
 * corn, YM, …); nothing about any product is assumed here.
 */
export class AcsilMarketProvider implements MarketProvider {
  private readonly scannerEngine: ScannerEngine;
  private readonly marketCache: MarketCacheService;
  private readonly logger: Logger;
  private readonly feed: AcsilTcpFeed;
  private readonly dataDir: string;
  private readonly snapshotsBySymbol = new Map<string, MarketSnapshot>();
  private readonly feedStatesBySymbol = new Map<string, SymbolFeedState>();
  private sierraConfig: SierraConfig;
  private eventsBound = false;
  private listenPort: number;

  constructor(
    scannerEngine: ScannerEngine,
    marketCache: MarketCacheService,
    logger: Logger,
    options?: { port?: number; dataDir?: string },
  ) {
    this.scannerEngine = scannerEngine;
    this.marketCache = marketCache;
    this.logger = logger.child({ component: "AcsilMarketProvider" });
    this.listenPort = options?.port ?? 18199;
    this.feed = new AcsilTcpFeed(this.listenPort, this.logger);
    this.dataDir = options?.dataDir ?? "data";
    this.sierraConfig = {
      localPort: this.listenPort,
      connectionType: "ACSIL_BRIDGE",
      status: "STANDBY",
      lastSyncTime: null,
      customSymbols: loadCustomSymbols(this.dataDir),
    };
    // Sierra mode starts EMPTY: no mock seeding. A symbol appears only
    // after genuine bridge data reaches the scanner engine.
  }

  start(): void {
    this.bindFeedEvents();
    this.feed.start();
    if (this.sierraConfig.customSymbols.length > 0) {
      this.sierraConfig.status = "STANDBY";
    }
  }

  stop(): void {
    this.feed.stop();
    this.sierraConfig.status = "DISCONNECTED";
    this.logger.info("ACSIL provider stopped");
  }

  getMarkets(): MarketData[] {
    return this.marketCache.getAll();
  }

  getSierraConfig(): SierraConfig {
    return { ...this.sierraConfig, symbolStates: Object.fromEntries(this.feedStatesBySymbol) };
  }

  syncSierra(params: SierraSyncRequest): { sierraConfig: SierraConfig; markets: MarketData[] } {
    const { localPort, connectionType, customSymbols } = params;

    if (localPort && Number(localPort) !== this.listenPort) {
      // Rebind the listener when the UI asks for a different port.
      this.feed.stop();
      this.listenPort = Number(localPort);
      this.feed.start();
      this.sierraConfig.localPort = this.listenPort;
    }
    if (connectionType) this.sierraConfig.connectionType = connectionType;

    this.sierraConfig.lastSyncTime = nowIso();

    if (customSymbols && Array.isArray(customSymbols) && customSymbols.length > 0) {
      this.sierraConfig.customSymbols = customSymbols.map((symbol) => symbol.toUpperCase().trim());
      saveCustomSymbols(this.dataDir, this.sierraConfig.customSymbols);
      for (const symbol of this.sierraConfig.customSymbols) {
        if (!this.feedStatesBySymbol.has(symbol)) {
          // Expected symbols waiting for their chart's study to dial in.
          this.feedStatesBySymbol.set(symbol, { status: "PENDING" });
        }
      }
    }

    this.sierraConfig.status = "CONNECTED";
    return {
      sierraConfig: this.getSierraConfig(),
      markets: this.getMarkets(),
    };
  }

  disconnectSierra(): SierraConfig {
    this.feed.stop();
    this.sierraConfig.status = "DISCONNECTED";
    this.sierraConfig.lastSyncTime = null;
    return this.getSierraConfig();
  }

  private bindFeedEvents(): void {
    if (this.eventsBound) return;
    this.eventsBound = true;
    this.feed.on("tick", (message) => this.handleTick(message));
  }

  private handleTick(message: AcsilMessage): void {
    switch (message.t) {
      case "hello":
        if (!this.feedStatesBySymbol.has(message.sym)) {
          this.feedStatesBySymbol.set(message.sym, { status: "PENDING" });
        }
        this.refreshStatus();
        break;
      case "trade":
        this.handleTrade(message.sym, message.ts, message.price, message.size);
        break;
      case "quote":
        this.handleQuote(message.sym, message.ts, message);
        break;
      case "depth":
        this.handleDepth(message.sym, message.ts, message);
        break;
    }
  }

  private handleTrade(symbol: string, ts: number, price: number, size: number): void {
    const instrument = this.getInstrument(symbol);
    const providerTimestamp = isoFromMillis(ts);
    const tradePrint: TradePrint = {
      instrument,
      price,
      size,
      aggressorSide: "UNKNOWN",
      providerTimestamp,
      receivedAt: nowIso(),
    };
    this.scannerEngine.onTradePrint(tradePrint);

    const previous = this.snapshotsBySymbol.get(symbol);
    const referencePrice = previous?.previousClose;
    const snapshot: MarketSnapshot = {
      instrument,
      lastPrice: price,
      bidPrice: previous?.bidPrice,
      askPrice: previous?.askPrice,
      bidSize: previous?.bidSize,
      askSize: previous?.askSize,
      open: previous?.open,
      high: previous?.high !== undefined ? Math.max(previous.high, price) : undefined,
      low: previous?.low !== undefined ? Math.min(previous.low, price) : undefined,
      previousClose: referencePrice,
      netChange: referencePrice ? price - referencePrice : previous?.netChange,
      percentChange: referencePrice ? ((price - referencePrice) / referencePrice) * 100 : previous?.percentChange,
      sessionVolume: previous?.sessionVolume !== undefined ? previous.sessionVolume + size : undefined,
      providerTimestamp,
      receivedAt: nowIso(),
    };
    this.snapshotsBySymbol.set(symbol, snapshot);
    this.scannerEngine.onMarketSnapshot(snapshot);
    this.feedStatesBySymbol.set(symbol, { status: "STREAMING" });
    this.refreshStatus();
  }

  private handleQuote(
    symbol: string,
    ts: number,
    quote: { bid?: number; ask?: number; bidSize?: number; askSize?: number },
  ): void {
    const previous = this.snapshotsBySymbol.get(symbol);
    if (!previous && quote.bid === undefined && quote.ask === undefined) return;

    const quoteRef = [quote.bid, quote.ask].find((p) => p !== undefined && p > 0);
    const lastPrice = previous?.lastPrice ?? quoteRef;
    if (lastPrice === undefined) return;

    const snapshot: MarketSnapshot = {
      instrument: this.getInstrument(symbol),
      lastPrice,
      bidPrice: quote.bid ?? previous?.bidPrice,
      askPrice: quote.ask ?? previous?.askPrice,
      bidSize: quote.bidSize ?? previous?.bidSize,
      askSize: quote.askSize ?? previous?.askSize,
      open: previous?.open,
      high: previous?.high,
      low: previous?.low,
      previousClose: previous?.previousClose,
      netChange: previous?.netChange,
      percentChange: previous?.percentChange,
      sessionVolume: previous?.sessionVolume,
      providerTimestamp: isoFromMillis(ts),
      receivedAt: nowIso(),
    };
    this.snapshotsBySymbol.set(symbol, snapshot);
    this.scannerEngine.onMarketSnapshot(snapshot);
    this.feedStatesBySymbol.set(symbol, { status: "STREAMING" });
    this.refreshStatus();
  }

  private handleDepth(
    symbol: string,
    ts: number,
    depth: { bids: Array<[number, number]>; asks: Array<[number, number]> },
  ): void {
    const toLevels = (pairs: Array<[number, number]>): OrderBookLevel[] =>
      pairs.slice(0, MAX_DEPTH_LEVELS).map(([price, size]) => ({ price, size }));
    const bids = toLevels(depth.bids).sort((a, b) => b.price - a.price);
    const asks = toLevels(depth.asks).sort((a, b) => a.price - b.price);
    const snapshot: OrderBookSnapshot = {
      instrument: this.getInstrument(symbol),
      bids,
      asks,
      depth: MAX_DEPTH_LEVELS,
      providerTimestamp: isoFromMillis(ts),
      receivedAt: nowIso(),
    };
    this.scannerEngine.onOrderBookSnapshot(snapshot);
  }

  private getInstrument(symbol: string): InstrumentIdentity {
    return {
      symbol,
      assetClass: "UNKNOWN",
      providerSymbol: symbol,
    };
  }

  private refreshStatus(): void {
    if (this.sierraConfig.status !== "DISCONNECTED") {
      this.sierraConfig.status = "CONNECTED";
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      provider: "acsil-bridge",
      state: this.sierraConfig.status === "CONNECTED" ? "CONNECTED" : "DISCONNECTED",
      endpoint: `0.0.0.0:${this.listenPort}`,
      lastMessageAt: this.feed.getLastMessageAt(),
      reconnectAttempts: 0,
      updatedAt: nowIso(),
    };
  }
}
