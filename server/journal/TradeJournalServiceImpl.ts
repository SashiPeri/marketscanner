import { randomUUID } from "crypto";
import { ScannerEngine } from "../scanner";
import { MarketCacheService } from "../services/MarketCacheService";
import {
  buildAiContext,
  computeDurationMs,
  computePnl,
  emptyMarketContext,
  emptyScannerSnapshot,
  snapshotMarketContext,
  snapshotScannerState,
} from "./snapshot";
import { TradeJournalRepository, TradeJournalService } from "./TradeJournalRepository";
import {
  RecordTradeRequest,
  TRADE_JOURNAL_SCHEMA_VERSION,
  TradeCore,
  TradeJournalEntry,
  TradeJournalQuery,
  TradeJournalSummary,
} from "./types";

export class TradeJournalServiceImpl implements TradeJournalService {
  constructor(
    private readonly repo: TradeJournalRepository,
    private readonly scannerEngine: ScannerEngine,
    private readonly marketCache: MarketCacheService,
  ) {}

  async recordTrade(request: RecordTradeRequest): Promise<TradeJournalEntry> {
    const capturedAt = new Date().toISOString();

    const pnl =
      request.pnl ??
      computePnl(request.side, request.entry, request.exit, request.size);

    const durationMs = computeDurationMs(request.entryTime, request.exitTime);

    const trade: TradeCore = {
      symbol: request.symbol.toUpperCase(),
      side: request.side,
      entry: request.entry,
      exit: request.exit,
      size: request.size,
      pnl,
      durationMs,
      entryTime: request.entryTime,
      exitTime: request.exitTime,
      account: request.account,
      notes: request.notes,
      tags: request.tags,
      entryFillId: request.entryFillId,
      exitFillId: request.exitFillId,
    };

    const captureLive = request.captureScannerState !== false;

    const scannerResult = captureLive
      ? this.scannerEngine.getResult(request.symbol)
      : undefined;

    const scanner = captureLive
      ? snapshotScannerState(scannerResult, capturedAt)
      : emptyScannerSnapshot(capturedAt);

    const market = captureLive
      ? snapshotMarketContext(this.scannerEngine, this.marketCache, request.symbol, capturedAt)
      : emptyMarketContext(capturedAt);

    const ai = buildAiContext(trade, scanner, market);

    const entry: TradeJournalEntry = {
      id: randomUUID(),
      schemaVersion: TRADE_JOURNAL_SCHEMA_VERSION,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      trade,
      scanner,
      market,
      ai,
    };

    this.repo.save(entry);
    return entry;
  }

  getTrade(id: string): TradeJournalEntry | undefined {
    return this.repo.get(id);
  }

  listTrades(query?: TradeJournalQuery): TradeJournalEntry[] {
    return this.repo.list(query);
  }

  deleteTrade(id: string): boolean {
    return this.repo.delete(id);
  }

  getSummary(query?: TradeJournalQuery): TradeJournalSummary {
    const entries = this.repo.list(query);

    const bySymbol: Record<string, { count: number; totalPnl: number }> = {};
    let totalPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalDuration = 0;

    for (const e of entries) {
      const sym = e.trade.symbol;
      totalPnl += e.trade.pnl;
      totalDuration += e.trade.durationMs;
      if (e.trade.pnl >= 0) winCount++; else lossCount++;

      if (!bySymbol[sym]) bySymbol[sym] = { count: 0, totalPnl: 0 };
      bySymbol[sym].count++;
      bySymbol[sym].totalPnl += e.trade.pnl;
    }

    return {
      count: entries.length,
      totalPnl,
      winCount,
      lossCount,
      avgPnl: entries.length > 0 ? totalPnl / entries.length : 0,
      avgDurationMs: entries.length > 0 ? totalDuration / entries.length : 0,
      bySymbol,
      schemaVersion: TRADE_JOURNAL_SCHEMA_VERSION,
    };
  }

  async flush(): Promise<void> {
    await this.repo.flush();
  }
}
