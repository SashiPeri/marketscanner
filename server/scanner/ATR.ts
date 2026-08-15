import { MarketSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { isFiniteNumber, sanitizeHighLow, wilderSmooth } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Wilder ATR (Average True Range) — incremental update.
 *
 * True Range = max(high − low, |high − prevClose|, |low − prevClose|)
 * ATR_t = (ATR_{t-1} × (n − 1) + TR_t) / n   (Wilder / TradingView RMA)
 *
 * When providers publish cumulative session H/L on every tick, the raw
 * high−low span inflates TR toward the full day range. In that case we
 * collapse to a close-to-close TR proxy so the smoother remains usable.
 */
export function updateAtr(state: SymbolState, snapshot: MarketSnapshot): void {
  const close = snapshot.lastPrice;
  if (!isFiniteNumber(close)) return;

  const period = state.atrPeriod > 0 ? state.atrPeriod : SCANNER_CONSTANTS.ATR_PERIOD;
  const prevClose =
    state.prevCloseForAtr > 0 && isFiniteNumber(state.prevCloseForAtr)
      ? state.prevCloseForAtr
      : close;

  let [high, low] = sanitizeHighLow(
    snapshot.high ?? close,
    snapshot.low ?? close,
    close,
  );

  if (isInflatedSessionRange(high, low, close, prevClose, state.currentAtr)) {
    high = close;
    low = close;
  }

  const tr = Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );

  if (!isFiniteNumber(tr) || tr < 0) {
    state.prevCloseForAtr = close;
    return;
  }

  if (!state.atrInitialized) {
    state.atrSmoothed = tr;
    state.atrInitialized = true;
  } else {
    state.atrSmoothed = wilderSmooth(state.atrSmoothed, tr, period);
  }

  state.currentAtr = state.atrSmoothed;
  state.prevCloseForAtr = close;
}

/**
 * Detect cumulative session H/L disguised as bar OHLC.
 * True 1-bar ranges stay near ATR / close-to-close magnitude.
 */
function isInflatedSessionRange(
  high: number,
  low: number,
  close: number,
  prevClose: number,
  currentAtr: number,
): boolean {
  const span = high - low;
  if (!(span > 0)) return false;

  const closeMove = Math.abs(close - prevClose);
  const atrHint = currentAtr > 0 ? currentAtr : 0;

  if (atrHint > 0 && span > atrHint * 3) return true;
  if (closeMove > 0 && span > closeMove * 5) return true;
  if (closeMove === 0 && atrHint > 0 && span > atrHint * 2) return true;
  return false;
}

/** Classify current volatility relative to price. */
export function classifyVolatility(
  atr: number,
  price: number,
): "LOW" | "NORMAL" | "HIGH" | "EXTREME" {
  if (!(price > 0) || !isFiniteNumber(price) || !isFiniteNumber(atr) || atr < 0) {
    return "NORMAL";
  }
  const atrPct = (atr / price) * 100;

  if (atrPct < 0.5) return "LOW";
  if (atrPct < 1.5) return "NORMAL";
  if (atrPct < 3.0) return "HIGH";
  return "EXTREME";
}

export { SCANNER_CONSTANTS };
