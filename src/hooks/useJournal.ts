import { useState, useEffect, useCallback } from "react";

export type TradeSide = "LONG" | "SHORT";

export interface RecordTradeRequest {
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  size: number;
  pnl?: number;
  entryTime: string;
  exitTime: string;
  account?: string;
  notes?: string;
  tags?: string[];
}

export interface TradeJournalEntry {
  id: string;
  createdAt: string;
  trade: {
    symbol: string;
    side: TradeSide;
    entry: number;
    exit: number;
    size: number;
    pnl: number;
    durationMs: number;
    entryTime: string;
    exitTime: string;
    account?: string;
    notes?: string;
    tags?: string[];
  };
  scanner: {
    capturedAt: string;
    regime?: string;
    score?: number;
    grade?: string;
    relativeVolume?: number;
    rationale?: string;
  };
}

export interface TradeJournalSummary {
  count: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  avgPnl: number;
  avgDurationMs: number;
  bySymbol: Record<string, { count: number; totalPnl: number }>;
}

export interface UseJournalResult {
  entries: TradeJournalEntry[];
  summary: TradeJournalSummary | null;
  isLoading: boolean;
  error: string | null;
  recordTrade: (req: RecordTradeRequest) => Promise<{ entry?: TradeJournalEntry; error?: string }>;
  deleteTrade: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useJournal(symbol?: string): UseJournalResult {
  const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
  const [summary, setSummary] = useState<TradeJournalSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (symbol) params.set("symbol", symbol);
      params.set("limit", "200");

      const [tradesRes, summaryRes] = await Promise.all([
        fetch(`/api/journal/trades?${params}`),
        fetch(`/api/journal/trades/summary?${symbol ? `symbol=${symbol}` : ""}`),
      ]);

      if (tradesRes.ok) {
        const d = await tradesRes.json();
        setEntries(d.entries ?? []);
      }

      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setSummary(d.summary ?? null);
      }
    } catch {
      setError("Failed to load journal.");
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  const recordTrade = useCallback(
    async (req: RecordTradeRequest): Promise<{ entry?: TradeJournalEntry; error?: string }> => {
      try {
        const res = await fetch("/api/journal/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error ?? "Failed to record trade." };
        // Refresh list
        await load();
        return { entry: data.entry };
      } catch {
        return { error: "Network error recording trade." };
      }
    },
    [load],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/journal/trades/${id}`, { method: "DELETE" });
        await load();
      } catch {
        setError("Failed to delete trade.");
      }
    },
    [load],
  );

  return {
    entries,
    summary,
    isLoading,
    error,
    recordTrade,
    deleteTrade,
    refresh: load,
  };
}
