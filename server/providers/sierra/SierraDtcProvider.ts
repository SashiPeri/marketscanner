import { EventEmitter } from "events";
import { Socket } from "net";
import {
  ConnectionStatus,
  InstrumentIdentity,
  MarketSnapshot,
  OrderBookLevel,
  OrderBookSnapshot,
  TradePrint,
} from "../../types";
import { logger } from "../../utils/logger";
import { DtcBinaryCodec } from "./DtcBinaryCodec";
import { DTC_LOGON_STATUS, DTC_MESSAGE_TYPES } from "./dtcConstants";
import { nowIso } from "./dtcDateTime";
import {
  ParsedBidAskUpdate,
  ParsedDepthLevel,
  ParsedDtcMessage,
  ParsedMarketSnapshot,
  ParsedSessionUpdate,
  ParsedTradeUpdate,
  SierraDtcConfig,
  SierraProviderEvents,
  SierraSubscription,
} from "./sierraTypes";

type ConnectionState = ConnectionStatus["state"];

export declare interface SierraDtcProvider {
  on<EventName extends keyof SierraProviderEvents>(
    event: EventName,
    listener: (payload: SierraProviderEvents[EventName]) => void,
  ): this;

  emit<EventName extends keyof SierraProviderEvents>(
    event: EventName,
    payload: SierraProviderEvents[EventName],
  ): boolean;
}

export class SierraDtcProvider extends EventEmitter {
  private socket: Socket | null = null;
  private readonly codec = new DtcBinaryCodec();
  private readonly subscriptionsBySymbol = new Map<string, SierraSubscription>();
  private readonly symbolIdBySymbol = new Map<string, number>();
  private readonly symbolById = new Map<number, string>();
  private readonly snapshotsBySymbol = new Map<string, MarketSnapshot>();
  private readonly orderBooksBySymbol = new Map<string, { bids: OrderBookLevel[]; asks: OrderBookLevel[] }>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private nextSymbolId = 1;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private state: ConnectionState = "DISCONNECTED";
  private connectedAt: string | undefined;
  private lastMessageAt: string | undefined;
  private lastError: string | undefined;
  private readonly warnedOnce = new Set<string>();

  constructor(private readonly config: SierraDtcConfig) {
    super();
  }

  connect(): void {
    this.shouldReconnect = true;
    this.clearReconnectTimer();
    this.setStatus(this.state === "DISCONNECTED" ? "CONNECTING" : "RECONNECTING");

    const socket = new Socket();
    this.socket = socket;

    socket.on("connect", () => {
      logger.info(`[SierraDTC] TCP connected to ${this.config.host}:${this.config.port}`);
      socket.write(this.codec.encodeEncodingRequest());
    });

    socket.on("data", (data) => this.handleData(data));

    socket.on("error", (error) => {
      this.lastError = error.message;
      this.emit("error", error);
      this.setStatus("ERROR");
    });

    socket.on("close", () => {
      this.stopHeartbeat();
      this.socket = null;
      this.connectedAt = undefined;
      this.setStatus("DISCONNECTED");
      if (this.shouldReconnect) this.scheduleReconnect();
    });

    socket.connect(this.config.port, this.config.host);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.socket?.destroy();
    this.socket = null;
    this.connectedAt = undefined;
    this.setStatus("DISCONNECTED");
  }

  subscribeMarketData(subscription: SierraSubscription): void {
    const symbolId = this.registerSubscription(subscription);
    this.writeIfConnected(this.codec.encodeMarketDataRequest(
      symbolId,
      subscription.symbol,
      subscription.exchange ?? this.config.exchange,
      true,
    ));
  }

  unsubscribeMarketData(symbol: string): void {
    const symbolId = this.symbolIdBySymbol.get(symbol);
    if (!symbolId) return;
    this.writeIfConnected(this.codec.encodeMarketDataRequest(symbolId, symbol, this.config.exchange, false));
  }

  subscribeMarketDepth(subscription: SierraSubscription): void {
    const symbolId = this.registerSubscription(subscription);
    this.writeIfConnected(this.codec.encodeMarketDepthRequest(
      symbolId,
      subscription.symbol,
      subscription.exchange ?? this.config.exchange,
      this.config.depthLevels,
      true,
    ));
  }

  unsubscribeMarketDepth(symbol: string): void {
    const symbolId = this.symbolIdBySymbol.get(symbol);
    if (!symbolId) return;
    this.writeIfConnected(this.codec.encodeMarketDepthRequest(
      symbolId,
      symbol,
      this.config.exchange,
      this.config.depthLevels,
      false,
    ));
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      provider: "sierra-dtc",
      state: this.state,
      endpoint: `${this.config.host}:${this.config.port}`,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      updatedAt: nowIso(),
    };
  }

  private handleData(data: Buffer): void {
    let messages: ParsedDtcMessage[];
    try {
      messages = this.codec.push(data);
    } catch (error: any) {
      this.lastError = error.message;
      this.emit("error", error);
      this.socket?.destroy();
      return;
    }

    for (const message of messages) {
      this.lastMessageAt = nowIso();
      try {
        this.handleMessage(message);
      } catch (error: any) {
        // A malformed message must never kill the socket loop.
        this.lastError = error?.message ?? "DTC message handling failed";
        this.emit("error", error instanceof Error ? error : new Error(this.lastError));
      }
    }

    this.emitStatus();
  }

  private handleMessage(message: ParsedDtcMessage): void {
    switch (message.type) {
      case DTC_MESSAGE_TYPES.ENCODING_RESPONSE:
        this.socket?.write(this.codec.encodeLogonRequest(this.config));
        break;

      case DTC_MESSAGE_TYPES.LOGON_RESPONSE:
        this.handleLogonResponse(message);
        break;

      case DTC_MESSAGE_TYPES.HEARTBEAT:
        break;

      case DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT:
        this.handleMarketSnapshot(this.codec.parseMarketSnapshot(message));
        break;

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_COMPACT:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_LAST_TRADE_SNAPSHOT:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_WITH_UNBUNDLED_INDICATOR:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_WITH_UNBUNDLED_INDICATOR_2:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_NO_TIMESTAMP:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_V2:
        this.handleTradeUpdate(this.codec.parseTradeUpdate(message));
        break;

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_COMPACT:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_NO_TIMESTAMP:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_FLOAT_WITH_MICROSECONDS:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_DOUBLE_WITH_MICROSECONDS:
        this.handleBidAskUpdate(this.codec.parseBidAskUpdate(message));
        break;

      case DTC_MESSAGE_TYPES.MARKET_DEPTH_SNAPSHOT_LEVEL:
      case DTC_MESSAGE_TYPES.MARKET_DEPTH_SNAPSHOT_LEVEL_FLOAT:
      case DTC_MESSAGE_TYPES.MARKET_DEPTH_UPDATE_LEVEL:
        this.handleDepthLevel(this.codec.parseDepthLevel(message));
        break;

      case DTC_MESSAGE_TYPES.MARKET_DATA_REJECT:
      case DTC_MESSAGE_TYPES.MARKET_DEPTH_REJECT: {
        const reject = this.codec.parseReject(message);
        const symbol = this.symbolById.get(reject.symbolId) ?? `#${reject.symbolId}`;
        const kind = message.type === DTC_MESSAGE_TYPES.MARKET_DEPTH_REJECT ? "depth" : "data";
        logger.warn(`[SierraDTC] ${kind} subscription rejected for ${symbol}: ${reject.text || "no reason given"}.`);
        break;
      }

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_VOLUME:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_HIGH:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_LOW:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_SETTLEMENT:
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_OPEN:
        this.handleSessionUpdate(this.codec.parseSessionUpdate(message));
        break;

      default:
        break;
    }
  }

  private handleLogonResponse(message: ParsedDtcMessage): void {
    const response = this.codec.parseLogonResponse(message);

    if (response.result === DTC_LOGON_STATUS.SUCCESS) {
      this.reconnectAttempts = 0;
      this.connectedAt = nowIso();
      this.lastError = undefined;
      this.setStatus("CONNECTED");
      this.startHeartbeat();
      this.resubscribeAll();
      return;
    }

    this.lastError = response.resultText || `DTC logon failed with result ${response.result}.`;
    this.setStatus("ERROR");

    if (response.result === DTC_LOGON_STATUS.ERROR_NO_RECONNECT) {
      this.shouldReconnect = false;
    }

    if (response.reconnectAddress) {
      logger.warn(`[SierraDTC] Server requested reconnect address: ${response.reconnectAddress}`);
    }

    this.socket?.destroy();
  }

  private handleMarketSnapshot(parsed: ParsedMarketSnapshot): void {
    const symbol = this.symbolById.get(parsed.symbolId);
    if (!symbol) return;

    const previous = this.snapshotsBySymbol.get(symbol);
    // Sierra sends all-zero snapshots when it has no data for a symbol.
    // Zero is not a price: fall back to the last known price, and emit
    // nothing at all when no price has ever been seen.
    const lastPrice = parsed.lastPrice && parsed.lastPrice > 0 ? parsed.lastPrice : previous?.lastPrice;
    if (lastPrice === undefined) {
      this.warnOnce(symbol, "empty snapshot with no known price — dropped (feed has no data yet)");
      return;
    }

    const instrument = this.getInstrument(symbol);
    const snapshot: MarketSnapshot = {
      instrument,
      lastPrice,
      bidPrice: parsed.bidPrice ?? previous?.bidPrice,
      askPrice: parsed.askPrice ?? previous?.askPrice,
      bidSize: parsed.bidSize ?? previous?.bidSize,
      askSize: parsed.askSize ?? previous?.askSize,
      open: parsed.open ?? previous?.open,
      high: parsed.high ?? previous?.high,
      low: parsed.low ?? previous?.low,
      previousClose: parsed.previousClose ?? previous?.previousClose,
      netChange: parsed.previousClose ? lastPrice - parsed.previousClose : previous?.netChange,
      percentChange: parsed.previousClose ? ((lastPrice - parsed.previousClose) / parsed.previousClose) * 100 : previous?.percentChange,
      sessionVolume: parsed.sessionVolume ?? previous?.sessionVolume,
      providerTimestamp: parsed.providerTimestamp,
      receivedAt: nowIso(),
    };

    this.snapshotsBySymbol.set(symbol, snapshot);
    this.emit("marketSnapshot", snapshot);
  }

  private handleSessionUpdate(parsed: ParsedSessionUpdate | undefined): void {
    if (!parsed) return;
    const symbol = this.symbolById.get(parsed.symbolId);
    if (!symbol) return;
    const previous = this.snapshotsBySymbol.get(symbol);
    // Session truth enriches a known snapshot; it never creates one from
    // nothing, and settlement never overwrites a real reference price.
    if (!previous) return;
    if (parsed.field === "previousClose" && previous.previousClose !== undefined) return;
    const snapshot: MarketSnapshot = { ...previous, receivedAt: nowIso() };
    if (parsed.field === "previousClose") {
      snapshot.previousClose = parsed.value;
      snapshot.netChange = snapshot.lastPrice - parsed.value;
      snapshot.percentChange = ((snapshot.lastPrice - parsed.value) / parsed.value) * 100;
    } else {
      snapshot[parsed.field] = parsed.value;
    }
    this.snapshotsBySymbol.set(symbol, snapshot);
    this.emit("marketSnapshot", snapshot);
  }

  private handleTradeUpdate(parsed: ParsedTradeUpdate | undefined): void {
    if (!parsed) return;
    const symbol = this.symbolById.get(parsed.symbolId);
    if (!symbol) return;
    // A zero/invalid print is not a print — drop it before it can move
    // high/low, volume, or the scanner.
    if (!Number.isFinite(parsed.price) || parsed.price <= 0) {
      this.warnOnce(symbol, `invalid print at ${parsed.price} — dropped`);
      return;
    }

    const instrument = this.getInstrument(symbol);
    const tradePrint: TradePrint = {
      instrument,
      price: parsed.price,
      size: parsed.size,
      aggressorSide: parsed.aggressorSide,
      providerTimestamp: parsed.providerTimestamp,
      receivedAt: nowIso(),
    };

    this.emit("tradePrint", tradePrint);

    const previous = this.snapshotsBySymbol.get(symbol);
    const referencePrice = previous?.previousClose;
    const snapshot: MarketSnapshot = {
      instrument,
      lastPrice: parsed.price,
      bidPrice: previous?.bidPrice,
      askPrice: previous?.askPrice,
      bidSize: previous?.bidSize,
      askSize: previous?.askSize,
      open: previous?.open,
      high: previous?.high !== undefined ? Math.max(previous.high, parsed.price) : undefined,
      low: previous?.low !== undefined ? Math.min(previous.low, parsed.price) : undefined,
      previousClose: referencePrice,
      netChange: referencePrice ? parsed.price - referencePrice : previous?.netChange,
      percentChange: referencePrice ? ((parsed.price - referencePrice) / referencePrice) * 100 : previous?.percentChange,
      sessionVolume: previous?.sessionVolume !== undefined ? previous.sessionVolume + parsed.size : undefined,
      providerTimestamp: parsed.providerTimestamp,
      receivedAt: nowIso(),
    };

    this.snapshotsBySymbol.set(symbol, snapshot);
    this.emit("marketSnapshot", snapshot);
  }

  private handleBidAskUpdate(parsed: ParsedBidAskUpdate | undefined): void {
    if (!parsed) return;
    const symbol = this.symbolById.get(parsed.symbolId);
    if (!symbol) return;

    const previous = this.snapshotsBySymbol.get(symbol);
    if (!previous && parsed.bidPrice === undefined && parsed.askPrice === undefined) return;

    // Quote-only noise with no reference price tells us nothing — and the
    // old `?? 0` fallback fabricated a price of zero. Positive quotes only.
    const quoteRef = [parsed.bidPrice, parsed.askPrice].find((p) => p !== undefined && p > 0);
    const lastPrice = previous?.lastPrice ?? quoteRef;
    if (lastPrice === undefined) return;

    const snapshot: MarketSnapshot = {
      instrument: this.getInstrument(symbol),
      lastPrice,
      bidPrice: parsed.bidPrice ?? previous?.bidPrice,
      askPrice: parsed.askPrice ?? previous?.askPrice,
      bidSize: parsed.bidSize ?? previous?.bidSize,
      askSize: parsed.askSize ?? previous?.askSize,
      open: previous?.open,
      high: previous?.high,
      low: previous?.low,
      previousClose: previous?.previousClose,
      netChange: previous?.netChange,
      percentChange: previous?.percentChange,
      sessionVolume: previous?.sessionVolume,
      providerTimestamp: parsed.providerTimestamp,
      receivedAt: nowIso(),
    };

    this.snapshotsBySymbol.set(symbol, snapshot);
    this.emit("marketSnapshot", snapshot);
  }

  private handleDepthLevel(parsed: ParsedDepthLevel | undefined): void {
    if (!parsed) return;
    const symbol = this.symbolById.get(parsed.symbolId);
    if (!symbol || parsed.side === "UNKNOWN") return;

    const book = this.orderBooksBySymbol.get(symbol) ?? { bids: [], asks: [] };
    const levels = parsed.side === "BID" ? book.bids : book.asks;
    const existingIndex = levels.findIndex((level) => level.price === parsed.price);

    if (this.codec.isDepthDelete(parsed.updateType)) {
      const deleteIndex = levels.findIndex((level) => level.price === parsed.price);
      if (deleteIndex >= 0) levels.splice(deleteIndex, 1);
    } else {
      const nextLevel: OrderBookLevel = {
        price: parsed.price,
        size: parsed.size,
        orderCount: parsed.orderCount,
      };

      if (existingIndex >= 0) {
        levels[existingIndex] = nextLevel;
      } else {
        levels.push(nextLevel);
      }
    }

    book.bids.sort((a, b) => b.price - a.price);
    book.asks.sort((a, b) => a.price - b.price);
    this.orderBooksBySymbol.set(symbol, book);

    const snapshot: OrderBookSnapshot = {
      instrument: this.getInstrument(symbol),
      bids: book.bids.slice(0, this.config.depthLevels),
      asks: book.asks.slice(0, this.config.depthLevels),
      depth: this.config.depthLevels,
      providerTimestamp: parsed.providerTimestamp,
      receivedAt: nowIso(),
    };

    this.emit("orderBookSnapshot", snapshot);
  }

  private registerSubscription(subscription: SierraSubscription): number {
    const existing = this.symbolIdBySymbol.get(subscription.symbol);
    if (existing) {
      this.subscriptionsBySymbol.set(subscription.symbol, subscription);
      return existing;
    }

    const symbolId = this.nextSymbolId++;
    this.symbolIdBySymbol.set(subscription.symbol, symbolId);
    this.symbolById.set(symbolId, subscription.symbol);
    this.subscriptionsBySymbol.set(subscription.symbol, subscription);
    return symbolId;
  }

  private getInstrument(symbol: string): InstrumentIdentity {
    const subscription = this.subscriptionsBySymbol.get(symbol);
    return {
      symbol,
      name: subscription?.instrument?.name,
      assetClass: subscription?.instrument?.assetClass ?? "UNKNOWN",
      venue: subscription?.exchange ?? this.config.exchange,
      providerSymbol: symbol,
      tickSize: subscription?.instrument?.tickSize,
      tickValue: subscription?.instrument?.tickValue,
      multiplier: subscription?.instrument?.multiplier,
      currency: subscription?.instrument?.currency,
    };
  }

  private resubscribeAll(): void {
    for (const subscription of this.subscriptionsBySymbol.values()) {
      const symbolId = this.registerSubscription(subscription);
      this.writeIfConnected(this.codec.encodeMarketDataRequest(symbolId, subscription.symbol, subscription.exchange ?? this.config.exchange, true));
      this.writeIfConnected(this.codec.encodeMarketDepthRequest(
        symbolId,
        subscription.symbol,
        subscription.exchange ?? this.config.exchange,
        this.config.depthLevels,
        true,
      ));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.writeIfConnected(this.codec.encodeHeartbeat());
    }, this.config.heartbeatIntervalSeconds * 1000);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    this.setStatus("RECONNECTING");
    this.reconnectTimer = setTimeout(() => this.connect(), this.config.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private writeIfConnected(buffer: Buffer): void {
    if (!this.socket || this.socket.destroyed) {
      // Drops here self-heal: subscriptions are registered first and
      // re-sent by resubscribeAll() on logon. Debug-level to stay quiet.
      logger.debug("[SierraDTC] write dropped — socket not connected (resubscribes on logon).");
      return;
    }
    this.socket.write(buffer);
  }

  private warnOnce(symbol: string, message: string): void {
    const key = `${symbol}:${message}`;
    if (this.warnedOnce.has(key)) return;
    this.warnedOnce.add(key);
    logger.warn(`[SierraDTC] ${symbol}: ${message}`);
  }

  private setStatus(state: ConnectionState): void {
    this.state = state;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit("connectionStatus", this.getConnectionStatus());
  }
}
