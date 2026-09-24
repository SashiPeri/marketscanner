import { MarketSnapshot } from "../types/domain";
import { MarketData } from "../types/market";

function mapAssetClassToCategory(
  assetClass: MarketSnapshot["instrument"]["assetClass"],
  symbol: string,
): MarketData["category"] {
  switch (assetClass) {
    case "FUTURES":
      return "FUTURES";
    case "FOREX":
      return "FOREX";
    case "CRYPTO":
      return "CRYPTO";
    case "EQUITIES":
      return "EQUITIES";
    default:
      break;
  }

  const symbolUpper = symbol.toUpperCase();
  if (symbolUpper.includes("BTC") || symbolUpper.includes("ETH")) return "CRYPTO";
  if (symbolUpper.length === 6 && symbolUpper.includes("USD")) return "FOREX";
  return "FUTURES";
}

function createDefaultScannerFields(): Pick<
  MarketData,
  "rvol" | "atr" | "adrFilledPct" | "vah" | "val" | "poc" | "regime" | "probScore" | "grade" | "rationale"
> {
  // No synthetic metrics: a bare snapshot carries prices only.
  // Scanner fields stay null until the engine computes them.
  return {
    rvol: null,
    atr: null,
    adrFilledPct: null,
    vah: null,
    val: null,
    poc: null,
    regime: "UNKNOWN",
    probScore: 50,
    grade: "C",
    rationale: "Awaiting scanner metrics.",
  };
}

export function mapSnapshotToMarketData(snapshot: MarketSnapshot, existing?: MarketData): MarketData {
  const symbol = snapshot.instrument.symbol.toUpperCase();
  const lastPrice = snapshot.lastPrice;
  const open = snapshot.open ?? existing?.open ?? lastPrice;
  const high = snapshot.high ?? existing?.high ?? lastPrice;
  const low = snapshot.low ?? existing?.low ?? lastPrice;
  const prevClose = snapshot.previousClose ?? existing?.prevClose ?? open;
  const netChange = snapshot.netChange ?? lastPrice - prevClose;
  const pctChange = snapshot.percentChange ?? (prevClose !== 0 ? (netChange / prevClose) * 100 : 0);
  const precision = mapAssetClassToCategory(snapshot.instrument.assetClass, symbol) === "FOREX" ? 4 : 2;
  const scannerDefaults = existing ?? createDefaultScannerFields();

  return {
    symbol,
    name: snapshot.instrument.name ?? existing?.name ?? `Sierra: ${symbol}`,
    category: mapAssetClassToCategory(snapshot.instrument.assetClass, symbol),
    lastPrice: Number(lastPrice.toFixed(precision)),
    netChange: Number(netChange.toFixed(precision)),
    pctChange: Number(pctChange.toFixed(2)),
    open: Number(open.toFixed(precision)),
    high: Number(high.toFixed(precision)),
    low: Number(low.toFixed(precision)),
    prevClose: Number(prevClose.toFixed(precision)),
    rvol: scannerDefaults.rvol,
    atr: scannerDefaults.atr,
    adrFilledPct: scannerDefaults.adrFilledPct,
    vah: scannerDefaults.vah,
    val: scannerDefaults.val,
    poc: scannerDefaults.poc,
    regime: scannerDefaults.regime,
    probScore: scannerDefaults.probScore,
    grade: scannerDefaults.grade,
    rationale: scannerDefaults.rationale,
  };
}
