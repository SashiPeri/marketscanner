import { ScannerEngine } from "../scanner";
import { ScoredScannerResult } from "../scanner/types";
import { MarketCacheService } from "../services/MarketCacheService";
import {
  MarketContextSnapshot,
  ScannerStateSnapshot,
  TradeCore,
  TradeJournalAiContext,
  TRADE_JOURNAL_SCHEMA_VERSION,
} from "./types";

export function computePnl(
  side: TradeCore["side"],
  entry: number,
  exit: number,
  size: number,
): number {
  const direction = side === "LONG" ? 1 : -1;
  return (exit - entry) * size * direction;
}

export function computeDurationMs(entryTime: string, exitTime: string): number {
  const start = Date.parse(entryTime);
  const end = Date.parse(exitTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

export function emptyScannerSnapshot(capturedAt: string): ScannerStateSnapshot {
  return {
    capturedAt,
    volumeProfile: {},
    signals: [],
  };
}

export function emptyMarketContext(capturedAt: string): MarketContextSnapshot {
  return { capturedAt };
}

export function snapshotScannerState(
  result: ScoredScannerResult | undefined,
  capturedAt: string,
): ScannerStateSnapshot {
  if (!result) return emptyScannerSnapshot(capturedAt);

  const m = result.metrics;
  return {
    capturedAt,
    vwap: m.vwap,
    distanceFromVwap: m.distanceFromVwap,
    cumulativeDelta: m.cumulativeDelta,
    relativeVolume: m.relativeVolume,
    volumeProfile: {
      pointOfControl: m.pointOfControl,
      valueAreaHigh: m.valueAreaHigh,
      valueAreaLow: m.valueAreaLow,
    },
    regime: m.regime,
    subRegime: m.subRegime,
    score: result.score,
    grade: result.grade,
    confidence: result.confidence,
    atr: m.atr,
    adrFilledPercent: m.adrFilledPercent,
    trendStrength: result.trendStrength,
    signalStrength: result.signalStrength,
    volatilityClass: m.volatilityClass,
    rationale: result.rationale,
    signals: [...result.signals],
  };
}

export function snapshotMarketContext(
  scannerEngine: ScannerEngine,
  marketCache: MarketCacheService,
  symbol: string,
  capturedAt: string,
): MarketContextSnapshot {
  const result = scannerEngine.getResult(symbol);
  const marketData = marketCache.get(symbol);
  const snapshot = result?.snapshot;
  const metrics = result?.metrics;

  return {
    capturedAt,
    instrument: result?.instrument ?? snapshot?.instrument,
    snapshot: snapshot ? { ...snapshot } : undefined,
    marketData: marketData ? { ...marketData } : undefined,
    sessionHigh: metrics?.sessionHigh ?? snapshot?.high,
    sessionLow: metrics?.sessionLow ?? snapshot?.low,
    sessionOpen: metrics?.sessionOpen ?? snapshot?.open,
    lastPrice: snapshot?.lastPrice ?? marketData?.lastPrice,
    bidPrice: snapshot?.bidPrice,
    askPrice: snapshot?.askPrice,
    sessionVolume: snapshot?.sessionVolume,
  };
}

/** Build AI-ready feature bag + summary without calling any model. */
export function buildAiContext(
  trade: TradeCore,
  scanner: ScannerStateSnapshot,
  market: MarketContextSnapshot,
): TradeJournalAiContext {
  const features: TradeJournalAiContext["features"] = {
    schemaVersion: TRADE_JOURNAL_SCHEMA_VERSION,
    symbol: trade.symbol,
    side: trade.side,
    entry: trade.entry,
    exit: trade.exit,
    size: trade.size,
    pnl: trade.pnl,
    durationMs: trade.durationMs,
    vwap: scanner.vwap ?? null,
    cumulativeDelta: scanner.cumulativeDelta ?? null,
    relativeVolume: scanner.relativeVolume ?? null,
    poc: scanner.volumeProfile.pointOfControl ?? null,
    vah: scanner.volumeProfile.valueAreaHigh ?? null,
    val: scanner.volumeProfile.valueAreaLow ?? null,
    regime: scanner.regime ?? null,
    score: scanner.score ?? null,
    grade: scanner.grade ?? null,
    signalCount: scanner.signals.length,
    lastPrice: market.lastPrice ?? null,
    sessionHigh: market.sessionHigh ?? null,
    sessionLow: market.sessionLow ?? null,
  };

  const pnlLabel = trade.pnl >= 0 ? "win" : "loss";
  const summaryText = [
    `${trade.side} ${trade.symbol}`,
    `entry ${trade.entry} → exit ${trade.exit}`,
    `size ${trade.size}`,
    `pnl ${trade.pnl.toFixed(4)} (${pnlLabel})`,
    `duration ${Math.round(trade.durationMs / 1000)}s`,
    scanner.regime ? `regime ${scanner.regime}` : null,
    scanner.score !== undefined ? `score ${scanner.score}` : null,
    scanner.relativeVolume !== undefined ? `rvol ${scanner.relativeVolume.toFixed(2)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const tags = [
    trade.side.toLowerCase(),
    pnlLabel,
    ...(trade.tags ?? []),
    ...(scanner.regime ? [scanner.regime.toLowerCase()] : []),
    ...(scanner.grade ? [`grade_${scanner.grade.replace("+", "plus")}`] : []),
  ];

  return {
    analysisStatus: "pending",
    features,
    summaryText,
    tags,
    analysis: null,
  };
}
