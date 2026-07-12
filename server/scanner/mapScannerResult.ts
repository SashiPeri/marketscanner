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

  const poc = metrics.pointOfControl ?? lastPrice;
  const vah = metrics.valueAreaHigh ?? poc;
  const val = metrics.valueAreaLow ?? poc;

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
    rvol: Number((metrics.relativeVolume ?? 1).toFixed(2)),
    atr: Number((metrics.atr ?? existing?.atr ?? lastPrice * 0.015).toFixed(precision)),
    adrFilledPct: Math.round(metrics.adrFilledPercent ?? existing?.adrFilledPct ?? 50),
    vah: Number(vah.toFixed(precision)),
    val: Number(val.toFixed(precision)),
    poc: Number(poc.toFixed(precision)),
    regime: (metrics.regime === "UNKNOWN" ? "RANGE_BOUND" : metrics.regime) ?? existing?.regime ?? "RANGE_BOUND",
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
