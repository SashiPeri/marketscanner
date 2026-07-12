import { useCallback, useEffect, useRef, useState } from "react";
import { MarketData, SierraConfig } from "../types";

/** Wire protocol types shared between client hook and server. */
export type SubscriptionKind = "symbol" | "watchlist" | "all" | "channel";

export interface ClientSubscription {
  kind: SubscriptionKind;
  symbols?: string[];
  watchlistId?: string;
  channel?: string;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "fallback";

export interface BatchMessage {
  type: "batch";
  channel: string;
  updates: MarketData[];
  timestamp: string;
  sequence: number;
}

export interface ConnectedMessage {
  type: "connected";
  connectionId: string;
  serverTime: string;
}

export interface UseMarketSocketOptions {
  path?: string;
  subscription?: ClientSubscription;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  fallbackPollIntervalMs?: number;
  enabled?: boolean;
}

export interface UseMarketSocketResult {
  markets: MarketData[];
  sierraConfig: SierraConfig | null;
  connectionStatus: ConnectionStatus;
  isLive: boolean;
  connectionId: string | null;
  lastBatchAt: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_SUBSCRIPTION: ClientSubscription = { kind: "all" };

function buildWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function mergeMarkets(existing: MarketData[], updates: MarketData[]): MarketData[] {
  if (updates.length === 0) return existing;
  const map = new Map(existing.map((m) => [m.symbol, m]));
  for (const update of updates) {
    map.set(update.symbol, update);
  }
  return Array.from(map.values());
}

export function useMarketSocket(options: UseMarketSocketOptions = {}): UseMarketSocketResult {
  const {
    path = "/ws",
    subscription = DEFAULT_SUBSCRIPTION,
    maxReconnectAttempts = 5,
    reconnectBaseDelayMs = 1000,
    fallbackPollIntervalMs = 3000,
    enabled = true,
  } = options;

  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [sierraConfig, setSierraConfig] = useState<SierraConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [lastBatchAt, setLastBatchAt] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUpdatesRef = useRef<MarketData[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchRest = useCallback(async () => {
    try {
      const res = await fetch("/api/market-data");
      if (!res.ok) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      setMarkets(data.markets || []);
      setSierraConfig(data.sierraConfig || null);
    } catch {
      // REST fallback errors are non-fatal
    }
  }, []);

  const flushPendingUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.length === 0) return;
    const batch = pendingUpdatesRef.current;
    pendingUpdatesRef.current = [];
    setMarkets((prev) => mergeMarkets(prev, batch));
    setLastBatchAt(new Date().toISOString());
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingUpdates();
    }, 50);
  }, [flushPendingUpdates]);

  const startFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current) return;
    setConnectionStatus("fallback");
    fetchRest();
    fallbackTimerRef.current = setInterval(fetchRest, fallbackPollIntervalMs);
  }, [fetchRest, fallbackPollIntervalMs]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const sendSubscribe = useCallback((ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "subscribe", subscription }));
  }, [subscription]);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    stopFallbackPolling();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

    const ws = new WebSocket(buildWsUrl(path));
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttemptRef.current = 0;
      setConnectionStatus("connected");
      sendSubscribe(ws);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      try {
        const message = JSON.parse(event.data as string);

        if (message.type === "connected") {
          const connected = message as ConnectedMessage;
          setConnectionId(connected.connectionId);
          return;
        }

        if (message.type === "batch") {
          const batch = message as BatchMessage;
          pendingUpdatesRef.current.push(...batch.updates);
          scheduleFlush();
          return;
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionId(null);

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay = reconnectBaseDelayMs * Math.pow(2, reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        setConnectionStatus("reconnecting");

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        startFallbackPolling();
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [
    enabled,
    path,
    maxReconnectAttempts,
    reconnectBaseDelayMs,
    sendSubscribe,
    scheduleFlush,
    startFallbackPolling,
    stopFallbackPolling,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    fetchRest().then(() => {
      if (enabled) connect();
      else startFallbackPolling();
    });

    return () => {
      mountedRef.current = false;

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      stopFallbackPolling();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect, fetchRest, startFallbackPolling, stopFallbackPolling]);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscribe(wsRef.current);
    }
  }, [subscription, sendSubscribe]);

  const isLive = connectionStatus === "connected";

  return {
    markets,
    sierraConfig,
    connectionStatus,
    isLive,
    connectionId,
    lastBatchAt,
    refresh: fetchRest,
  };
}
