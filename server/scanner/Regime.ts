import { MarketSnapshot } from "../types/domain";
import { classifyAdrPosition } from "./ADR";
import { classifyRvol } from "./RelativeVolume";
import { classifyVolatility } from "./ATR";
import { SCANNER_CONSTANTS } from "./constants";
import { clamp, isFiniteNumber, linearSlope, pushRingBuffer } from "./math";
import { isOpeningRangeBreakoutDown, isOpeningRangeBreakoutUp } from "./SessionMetrics";
import { SymbolState, ScannerMetricsRegime } from "./SymbolState";

export interface RegimeAnalysis {
  regime: ScannerMetricsRegime;
  subRegime: "TREND" | "BALANCE" | "ROTATION" | "BREAKOUT" | "UNKNOWN";
  trendStrength: number;
  volatilityClass: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
}

/** Minimum ATR used when normalizing slope — prevents explode-to-infinity. */
const ATR_NORM_FLOOR_RATIO = 1e-6;

/**
 * Regime detection combining price structure, volume, ADR position, and order flow.
 *
 * - TREND: directional slope with confirming structure
 * - BALANCE: rotation between value area boundaries
 * - ROTATION: low RVol chop inside prior range
 * - BREAKOUT: price outside value area or opening range
 */
export function detectRegime(state: SymbolState, snapshot: MarketSnapshot): RegimeAnalysis {
  const price = snapshot.lastPrice;
  if (isFiniteNumber(price)) {
    pushRingBuffer(state.recentPrices, price, SCANNER_CONSTANTS.PRICE_HISTORY_LENGTH);
  }

  const slope = linearSlope(state.recentPrices);
  const atrFloor = Math.max(
    state.currentAtr,
    Math.abs(price) * ATR_NORM_FLOOR_RATIO,
    Number.EPSILON,
  );
  const normalizedSlope = isFiniteNumber(slope) ? slope / atrFloor : 0;
  const trendStrength = clamp(Math.abs(normalizedSlope) * 50, 0, 100);

  state.trendStrength = trendStrength;
  state.volatilityClass = classifyVolatility(state.currentAtr, price);

  const rvolClass = classifyRvol(state.relativeVolume);
  const adrClass = classifyAdrPosition(state.adrFilledPercent);

  let subRegime: RegimeAnalysis["subRegime"] = "UNKNOWN";
  let regime: ScannerMetricsRegime = "UNKNOWN";

  const aboveVah = state.vah > 0 && price > state.vah;
  const belowVal = state.val > 0 && price < state.val;
  const insideValueArea = !aboveVah && !belowVal && state.vah > 0 && state.val > 0;

  if (isOpeningRangeBreakoutUp(state, price) || isOpeningRangeBreakoutDown(state, price)) {
    subRegime = "BREAKOUT";
  } else if (aboveVah || belowVal) {
    subRegime = "BREAKOUT";
  } else if (insideValueArea && rvolClass === "LOW") {
    subRegime = "ROTATION";
  } else if (insideValueArea) {
    subRegime = "BALANCE";
  } else if (Math.abs(normalizedSlope) > 0.02) {
    subRegime = "TREND";
  }

  if (subRegime === "BREAKOUT") {
    regime = normalizedSlope >= 0 ? "TRENDING_UP" : "TRENDING_DOWN";
  } else if (subRegime === "TREND") {
    regime = normalizedSlope > 0 ? "TRENDING_UP" : "TRENDING_DOWN";
  } else if (subRegime === "ROTATION" || (rvolClass === "LOW" && adrClass === "MID")) {
    regime = "CHOPPY";
  } else if (subRegime === "BALANCE") {
    regime = "RANGE_BOUND";
  } else if (state.recentPrices.length >= SCANNER_CONSTANTS.MIN_REGIME_SAMPLES) {
    regime =
      normalizedSlope > 0.005
        ? "TRENDING_UP"
        : normalizedSlope < -0.005
          ? "TRENDING_DOWN"
          : "RANGE_BOUND";
  }

  state.regime = regime;
  state.subRegime = subRegime;

  return { regime, subRegime, trendStrength, volatilityClass: state.volatilityClass };
}
