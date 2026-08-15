import { MarketSnapshot } from "../types/domain";
import { cumulativeCurveFraction } from "../baseline/seedBaselines";
import { SCANNER_CONSTANTS } from "./constants";
import { isFiniteNumber, safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Relative Volume (RVol):
 * RVol = cumulative session volume / expected session volume at time-of-day.
 *
 * Institutional form (Trade Ideas, TrendSpider, Bloomberg RVOL):
 *   expected = ADV × CDF(intraday volume curve up to now)
 * Without a curve, expected = full-session average daily volume.
 */
export function updateRelativeVolume(state: SymbolState, snapshot: MarketSnapshot): void {
  const rawVolume = snapshot.sessionVolume ?? state.sessionVolume;
  const volume = isFiniteNumber(rawVolume) && rawVolume >= 0 ? rawVolume : state.sessionVolume;
  state.sessionVolume = volume;

  if (!isFiniteNumber(snapshot.lastPrice)) return;

  state.applyFallbackBaselines(snapshot.lastPrice);

  const expectedVolume = resolveExpectedSessionVolume(state, snapshot.receivedAt);
  const rvol = safeDivide(volume, expectedVolume, 1);
  state.relativeVolume = isFiniteNumber(rvol) && rvol >= 0 ? rvol : 1;
}

function resolveExpectedSessionVolume(state: SymbolState, receivedAt: string): number {
  const avg = state.averageSessionVolume;
  if (!(avg > 0) || !isFiniteNumber(avg)) {
    return 1;
  }

  if (state.intradayVolumeCurve.length === 0) {
    return avg;
  }

  const date = new Date(receivedAt);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  if (!isFiniteNumber(hour) || !isFiniteNumber(minute)) {
    return avg;
  }

  const fraction = cumulativeCurveFraction(state.intradayVolumeCurve, hour, minute);
  const safeFraction = isFiniteNumber(fraction) && fraction > 0 ? Math.min(fraction, 1) : 0.01;
  return Math.max(Number.EPSILON, avg * safeFraction);
}

/** Classify RVol into participation tier. */
export function classifyRvol(rvol: number): "HIGH" | "NORMAL" | "LOW" {
  if (!isFiniteNumber(rvol)) return "NORMAL";
  if (rvol >= SCANNER_CONSTANTS.HIGH_RVOL_THRESHOLD) return "HIGH";
  if (rvol <= SCANNER_CONSTANTS.LOW_RVOL_THRESHOLD) return "LOW";
  return "NORMAL";
}
