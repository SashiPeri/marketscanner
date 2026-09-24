import { MarketData } from "../types/market";
import { ScoredScannerResult } from "./types";

function mapAssetClassToCategory(
  symbol: string,
  existing?: MarketData,
): MarketData["category"] {
  if (existing?.category) return existing.category;

  const symbolUpper = symbol.toUpperCase();
  if (symbolUpper.includes("BTC") || symbolUpper.includes("ETH")) return "CRYPTO";
  if (symbolUpper.length === 6 && symbolUpper.includes("USD")) return "FOREX";
  return "FUTURES";
}

function pricePrecision(category: MarketData["category"]): number {
  return category === "FOREX" ? 4 : 2;
}

/**
 * Maps a ScoredScannerResult into the REST-facing MarketData contract.
 * Preserves display metadata from existing cache entries when available.
 */
export function mapScannerResultToMarketData(
  result: ScoredScannerResult,
  existing?: MarketData,
): MarketData {
  const { snapshot, metrics, score, grade, rationale } = result;
  const symbol = snapshot.instrument.symbol.toUpperCase();
  const category = mapAssetClassToCategory(symbol, existing);
  const precision = pricePrecision(category);

  const lastPrice = snapshot.lastPrice;
  const open = snapshot.open ?? metrics.sessionOpen ?? existing?.open ?? lastPrice;
  const high = snapshot.high ?? metrics.sessionHigh ?? existing?.high ?? lastPrice;
  const low = snapshot.low ?? metrics.sessionLow ?? existing?.low ?? lastPrice;
  const prevClose = snapshot.previousClose ?? existing?.prevClose ?? open;
  const netChange = snapshot.netChange ?? lastPrice - prevClose;
  const pctChange =
    snapshot.percentChange ?? (prevClose !== 0 ? (netChange / prevClose) * 100 : 0);

  const poc = metrics.pointOfControl ?? null;
  const vah = metrics.valueAreaHigh ?? null;
  const val = metrics.valueAreaLow ?? null;

  return {
    symbol,
    name: snapshot.instrument.name ?? existing?.name ?? symbol,
    category,
    lastPrice: Number(lastPrice.toFixed(precision)),
    netChange: Number(netChange.toFixed(precision)),
    pctChange: Number(pctChange.toFixed(2)),
    open: Number(open.toFixed(precision)),
    high: Number(high.toFixed(precision)),
    low: Number(low.toFixed(precision)),
    prevClose: Number(prevClose.toFixed(precision)),
    rvol: metrics.relativeVolume !== undefined
      ? Number(metrics.relativeVolume.toFixed(2))
      : (existing?.rvol ?? null),
    atr: metrics.atr !== undefined
      ? Number(metrics.atr.toFixed(precision))
      : (existing?.atr ?? null),
    adrFilledPct: metrics.adrFilledPercent !== undefined
      ? Math.round(metrics.adrFilledPercent)
      : (existing?.adrFilledPct ?? null),
    vah: vah !== null ? Number(vah.toFixed(precision)) : null,
    val: val !== null ? Number(val.toFixed(precision)) : null,
    poc: poc !== null ? Number(poc.toFixed(precision)) : null,
    regime: metrics.regime ?? existing?.regime ?? "UNKNOWN",
    probScore: score,
    grade,
    rationale,
  };
}

/** Build scanner baselines from existing MarketData seed rows. */
export function marketDataToBaseline(market: MarketData): import("./types").SymbolBaseline {
  const price = market.lastPrice;
  const adr = market.high - market.low > 0 ? (market.high - market.low) / (market.adrFilledPct / 100 || 1) : price * 0.015;

  return {
    symbol: market.symbol,
    name: market.name,
    category: market.category,
    averageDailyRange: adr,
    averageSessionVolume: price * 1000 * market.rvol,
    previousClose: market.prevClose,
  };
}
