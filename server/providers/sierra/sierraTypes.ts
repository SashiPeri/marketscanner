import type { SymbolFeedState, SymbolFeedStatus } from "../../types/market";
import {
  ConnectionStatus,
  InstrumentIdentity,
  MarketSnapshot,
  OrderBookSnapshot,
  TradePrint,
} from "../../types";

export type { SymbolFeedState, SymbolFeedStatus };

export interface SierraDtcConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  heartbeatIntervalSeconds: number;
  reconnectDelayMs: number;
  marketDataTransmissionIntervalMs: number;
  clientName: string;
  exchange?: string;
  depthLevels: number;
}

export interface SierraSubscription {
  symbol: string;
  exchange?: string;
  instrument?: Partial<InstrumentIdentity>;
}

export interface SierraProviderEvents {
  marketSnapshot: MarketSnapshot;
  orderBookSnapshot: OrderBookSnapshot;
  tradePrint: TradePrint;
  connectionStatus: ConnectionStatus;
  error: Error;
}

export interface ParsedDtcMessage {
  size: number;
  type: number;
  body: Buffer;
}

export interface ParsedDtcReject {
  symbolId: number;
  text: string;
}

export type SessionTruthField = "sessionVolume" | "high" | "low" | "previousClose" | "open";

export interface ParsedSessionUpdate {
  symbolId: number;
  field: SessionTruthField;
  value: number;
}

export interface ParsedLogonResponse {
  result: number;
  resultText: string;
  reconnectAddress?: string;
  serverName?: string;
}

export interface ParsedTradeUpdate {
  symbolId: number;
  price: number;
  size: number;
  aggressorSide?: TradePrint["aggressorSide"];
  providerTimestamp?: string;
}

export interface ParsedBidAskUpdate {
  symbolId: number;
  bidPrice?: number;
  bidSize?: number;
  askPrice?: number;
  askSize?: number;
  providerTimestamp?: string;
}

export interface ParsedMarketSnapshot {
  symbolId: number;
  lastPrice?: number;
  bidPrice?: number;
  askPrice?: number;
  bidSize?: number;
  askSize?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  sessionVolume?: number;
  providerTimestamp?: string;
}

export interface ParsedDepthLevel {
  symbolId: number;
  side: "BID" | "ASK" | "UNKNOWN";
  price: number;
  size: number;
  level: number;
  orderCount?: number;
  updateType?: number;
  isFinalUpdate?: boolean;
  providerTimestamp?: string;
}

/**
 * Sierra's own answer for a symbol string (DTC 507). `known` is true only
 * when Sierra echoes a non-empty description with a nonzero security type —
 * e.g. bare "ESZ26" comes back empty/0 (unknown) while "ESZ26-CME" comes
 * back as a future with "E-MINI S&P 500 ...". No product names live here;
 * every value comes off the wire.
 */
export interface SierraSecurityDefinition {
  symbol: string;
  exchange: string;
  securityType: number;
  description: string;
  known: boolean;
}

export interface ParsedSecurityDefinition {
  requestId: number;
  symbol: string;
  exchange: string;
  securityType: number;
  description: string;
}
