import { useState, useEffect, useCallback } from "react";

export type IndicatorId =
  | "rvol"
  | "adr"
  | "atr"
  | "vwap"
  | "regime"
  | "score"
  | "grade"
  | "delta"
  | "vah"
  | "val"
  | "poc"
  | "pctChange"
  | "netChange"
  | "signals";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  indicator: IndicatorId | "symbol" | "pctChange" | "netChange";
  direction: SortDirection;
}

export interface FilterCondition {
  indicator: IndicatorId | "symbol" | "category";
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "in";
  value: number | string | string[];
}

export interface ScannerConfig {
  version: number;
  universe: string[];
  selectedIndicators: IndicatorId[];
  filters: FilterCondition[];
  sort: SortConfig;
  updatedAt: string;
}

export interface WatchlistSymbol {
  symbol: string;
  name?: string;
  category?: "FUTURES" | "FOREX" | "CRYPTO" | "EQUITIES";
  addedAt: string;
}

export interface Entitlement {
  tier: "free" | "paid";
  maxSymbols: number;
  liveDataEnabled: boolean;
}

export interface IndicatorMeta {
  label: string;
  description: string;
  numeric: boolean;
  defaultVisible: boolean;
}

export interface UseScannerConfigResult {
  config: ScannerConfig | null;
  watchlist: WatchlistSymbol[];
  entitlement: Entitlement | null;
  indicators: Record<IndicatorId, IndicatorMeta>;
  isLoading: boolean;
  error: string | null;
  updateConfig: (patch: Partial<Omit<ScannerConfig, "version" | "updatedAt">>) => Promise<void>;
  addSymbol: (symbol: string, name?: string, category?: WatchlistSymbol["category"]) => Promise<{ error?: string }>;
  removeSymbol: (symbol: string) => Promise<void>;
}

const DEFAULT_INDICATORS: Record<string, IndicatorMeta> = {};

export function useScannerConfig(): UseScannerConfigResult {
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistSymbol[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [indicators, setIndicators] = useState<Record<IndicatorId, IndicatorMeta>>(DEFAULT_INDICATORS as Record<IndicatorId, IndicatorMeta>);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const [cfgRes, wlRes] = await Promise.all([
        fetch("/api/scanner/config"),
        fetch("/api/scanner/watchlist"),
      ]);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setConfig(cfgData.config);
        setEntitlement(cfgData.entitlement);
        setIndicators(cfgData.indicatorRegistry ?? {});
      }

      if (wlRes.ok) {
        const wlData = await wlRes.json();
        setWatchlist(wlData.symbols ?? []);
        if (wlData.tier) {
          setEntitlement((prev) =>
            prev
              ? { ...prev, tier: wlData.tier, maxSymbols: wlData.limit }
              : { tier: wlData.tier, maxSymbols: wlData.limit, liveDataEnabled: false },
          );
        }
      }
    } catch (err) {
      setError("Failed to load scanner config.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(
    async (patch: Partial<Omit<ScannerConfig, "version" | "updatedAt">>) => {
      try {
        const res = await fetch("/api/scanner/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
        }
      } catch {
        setError("Failed to save scanner config.");
      }
    },
    [],
  );

  const addSymbol = useCallback(
    async (
      symbol: string,
      name?: string,
      category?: WatchlistSymbol["category"],
    ): Promise<{ error?: string }> => {
      try {
        const res = await fetch("/api/scanner/watchlist/symbols", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, name, category }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { error: data.error ?? "Failed to add symbol." };
        }
        setWatchlist(data.symbols ?? []);
        return {};
      } catch {
        return { error: "Network error adding symbol." };
      }
    },
    [],
  );

  const removeSymbol = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/scanner/watchlist/symbols/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.symbols ?? []);
      }
    } catch {
      setError("Failed to remove symbol.");
    }
  }, []);

  return {
    config,
    watchlist,
    entitlement,
    indicators,
    isLoading,
    error,
    updateConfig,
    addSymbol,
    removeSymbol,
  };
}
