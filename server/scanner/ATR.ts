import { MarketSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { wilderSmooth } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Wilder ATR (Average True Range) — incremental update.
 *
 * True Range = max(high − low, |high − prevClose|, |low − prevClose|)
 * ATR_t = (ATR_{t-1} × (n − 1) + TR_t) / n
 */
export function updateAtr(state: SymbolState, snapshot: MarketSnapshot): void {
  const high = snapshot.high ?? snapshot.lastPrice;
  const low = snapshot.low ?? snapshot.lastPrice;
  const close = snapshot.lastPrice;
  const prevClose = state.prevCloseForAtr > 0 ? state.prevCloseForAtr : close;

  const tr = Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );

  if (!state.atrInitialized) {
    state.atrSmoothed = tr;
    state.atrInitialized = true;
  } else {
    state.atrSmoothed = wilderSmooth(state.atrSmoothed, tr, state.atrPeriod);
  }

  state.currentAtr = state.atrSmoothed;
  state.prevCloseForAtr = close;
}

/** Classify current volatility relative to price. */
export function classifyVolatility(
  atr: number,
  price: number,
): "LOW" | "NORMAL" | "HIGH" | "EXTREME" {
  if (price <= 0) return "NORMAL";
  const atrPct = (atr / price) * 100;

  if (atrPct < 0.5) return "LOW";
  if (atrPct < 1.5) return "NORMAL";
  if (atrPct < 3.0) return "HIGH";
  return "EXTREME";
}

export { SCANNER_CONSTANTS };
