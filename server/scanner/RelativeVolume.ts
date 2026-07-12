import { MarketSnapshot } from "../types/domain";
import { cumulativeCurveFraction } from "../baseline/seedBaselines";
import { SCANNER_CONSTANTS } from "./constants";
import { safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Relative Volume (RVol):
 * RVol = cumulative session volume / expected session volume baseline.
 *
 * When an intraday volume curve is available from BaselineStore, expected volume
 * is adjusted for time-of-day. Otherwise falls back to full-session average.
 */
export function updateRelativeVolume(state: SymbolState, snapshot: MarketSnapshot): void {
  const volume = snapshot.sessionVolume ?? state.sessionVolume;
  state.sessionVolume = volume;

  state.applyFallbackBaselines(snapshot.lastPrice);

  const expectedVolume = resolveExpectedSessionVolume(state, snapshot.receivedAt);
  state.relativeVolume = safeDivide(volume, expectedVolume, 1);
  state.relativeVolume = Math.max(0, state.relativeVolume);
}

function resolveExpectedSessionVolume(state: SymbolState, receivedAt: string): number {
  if (state.intradayVolumeCurve.length === 0) {
    return state.averageSessionVolume;
  }

  const date = new Date(receivedAt);
  const fraction = cumulativeCurveFraction(
    state.intradayVolumeCurve,
    date.getUTCHours(),
    date.getUTCMinutes(),
  );

  return Math.max(1, state.averageSessionVolume * Math.max(fraction, 0.01));
}

/** Classify RVol into participation tier. */
export function classifyRvol(rvol: number): "HIGH" | "NORMAL" | "LOW" {
  if (rvol >= SCANNER_CONSTANTS.HIGH_RVOL_THRESHOLD) return "HIGH";
  if (rvol <= SCANNER_CONSTANTS.LOW_RVOL_THRESHOLD) return "LOW";
  return "NORMAL";
}
