import { MarketData } from "../types/market";

/** Wire-format subscription kinds supported by the realtime server. */
export type SubscriptionKind = "symbol" | "watchlist" | "all" | "channel";

export interface SymbolSubscription {
  kind: "symbol";
  symbols: string[];
}

export interface WatchlistSubscription {
  kind: "watchlist";
  watchlistId: string;
  symbols: string[];
}

export interface AllSymbolsSubscription {
  kind: "all";
}

export interface ChannelSubscription {
  kind: "channel";
  channel: string;
}

export type ClientSubscription =
  | SymbolSubscription
  | WatchlistSubscription
  | AllSymbolsSubscription
  | ChannelSubscription;

/** Client → Server messages. */
export type ClientMessage =
  | { type: "subscribe"; subscription: ClientSubscription }
  | { type: "unsubscribe"; subscription: ClientSubscription }
  | { type: "ping"; clientTime?: string };

/** Server → Client messages. */
export type ServerMessage =
  | { type: "connected"; connectionId: string; serverTime: string }
  | { type: "pong"; serverTime: string }
  | { type: "batch"; channel: string; updates: MarketData[]; timestamp: string; sequence: number }
  | { type: "error"; message: string }
  | { type: "stats"; clients: number; subscriptions: number };

export interface RealtimeConfig {
  path: string;
  batchIntervalMs: number;
  heartbeatIntervalMs: number;
  staleConnectionMs: number;
  maxOutboundQueue: number;
}

export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = {
  path: "/ws",
  batchIntervalMs: 50,
  heartbeatIntervalMs: 30_000,
  staleConnectionMs: 90_000,
  maxOutboundQueue: 8,
};

export interface ConnectionStats {
  connectionId: string;
  connectedAt: string;
  lastActivityAt: string;
  subscriptions: ClientSubscription[];
  outboundQueueDepth: number;
  batchesSent: number;
  batchesDropped: number;
}

export interface HubStats {
  totalClients: number;
  totalSubscriptions: number;
  batchesPublished: number;
  updatesCoalesced: number;
}
