import { ScannerSignal } from "../types/domain";
import { classifyAdrPosition } from "./ADR";
import { classifyRvol } from "./RelativeVolume";
import { buyingPressure } from "./Delta";
import { SCANNER_CONSTANTS } from "./constants";
import { clamp } from "./math";
import { distanceFromVwap } from "./VWAP";
import { SymbolState } from "./SymbolState";
import { RegimeAnalysis } from "./Regime";

export interface ScoreResult {
  score: number;
  confidence: number;
  grade: "A+" | "A" | "B" | "C" | "F";
  trendStrength: number;
  signalStrength: number;
  rationale: string;
}

/**
 * Composite scoring engine — combines metrics into a normalized 0–100 probability score.
 * Scoring is fully isolated from metric calculation modules.
 */
export function computeScore(
  state: SymbolState,
  price: number,
  regime: RegimeAnalysis,
  signals: ScannerSignal[],
): ScoreResult {
  const weights = SCANNER_CONSTANTS.SCORE_WEIGHTS;

  const rvolScore = scoreRelativeVolume(state.relativeVolume);
  const trendScore = scoreTrendAlignment(regime, state);
  const adrScore = scoreAdrPosition(state.adrFilledPercent);
  const vwapScore = scoreVwapPosition(state, price);
  const deltaScore = scoreDeltaConfirmation(state, regime);
  const regimeScore = scoreRegimeQuality(regime);

  const rawScore =
    rvolScore * weights.RELATIVE_VOLUME +
    trendScore * weights.TREND_ALIGNMENT +
    adrScore * weights.ADR_POSITION +
    vwapScore * weights.VWAP_POSITION +
    deltaScore * weights.DELTA_CONFIRMATION +
    regimeScore * weights.REGIME_QUALITY;

  const score = clamp(Math.round(rawScore), 0, 100);
  const signalStrength = scoreSignals(signals);
  const confidence = computeConfidence(state, regime, signals);
  const grade = scoreToGrade(score);
  const rationale = buildRationale(state, regime, signals, score);

  return {
    score,
    confidence,
    grade,
    trendStrength: regime.trendStrength,
    signalStrength,
    rationale,
  };
}

function scoreRelativeVolume(rvol: number): number {
  const cls = classifyRvol(rvol);
  if (cls === "HIGH") return clamp(60 + (rvol - 1) * 30, 60, 100);
  if (cls === "LOW") return clamp(40 - (1 - rvol) * 60, 0, 40);
  return 55;
}

function scoreTrendAlignment(regime: RegimeAnalysis, state: SymbolState): number {
  if (regime.regime === "TRENDING_UP" || regime.regime === "TRENDING_DOWN") {
    return clamp(50 + regime.trendStrength * 0.5, 50, 100);
  }
  if (regime.regime === "RANGE_BOUND") return 60;
  if (regime.regime === "CHOPPY") return 25;
  return 40 + state.trendStrength * 0.2;
}

function scoreAdrPosition(adrFilledPercent: number): number {
  const cls = classifyAdrPosition(adrFilledPercent);
  if (cls === "RUNWAY") return 80;
  if (cls === "MID") return 60;
  return 35;
}

function scoreVwapPosition(state: SymbolState, price: number): number {
  if (state.vwap <= 0) return 50;
  const dist = distanceFromVwap(state, price);
  const atr = state.currentAtr > 0 ? state.currentAtr : 1;
  const normalizedDist = Math.abs(dist) / atr;

  if (state.vwapReclaim) return 90;
  if (state.vwapRejection) return 20;
  if (normalizedDist < 0.25) return 70;
  if (normalizedDist < 0.75) return 55;
  return 40;
}

function scoreDeltaConfirmation(state: SymbolState, regime: RegimeAnalysis): number {
  const buyPress = buyingPressure(state);
  if (regime.regime === "TRENDING_UP") return clamp(buyPress * 100, 40, 100);
  if (regime.regime === "TRENDING_DOWN") return clamp((1 - buyPress) * 100, 40, 100);
  return clamp(50 + state.tradeImbalance * 30, 20, 80);
}

function scoreRegimeQuality(regime: RegimeAnalysis): number {
  switch (regime.subRegime) {
    case "TREND":
      return 85;
    case "BREAKOUT":
      return 80;
    case "BALANCE":
      return 65;
    case "ROTATION":
      return 30;
    default:
      return 45;
  }
}

function scoreSignals(signals: ScannerSignal[]): number {
  if (signals.length === 0) return 0;

  let strength = 0;
  for (const signal of signals) {
    const severityWeight = signal.severity === "HIGH" ? 30 : signal.severity === "MEDIUM" ? 20 : 10;
    const directionWeight = signal.direction === "NEUTRAL" ? 0.3 : 1;
    const typeWeight = signal.type === "AVOID" ? -1 : 1;
    strength += severityWeight * directionWeight * typeWeight;
  }

  return clamp(strength, 0, 100);
}

function computeConfidence(
  state: SymbolState,
  regime: RegimeAnalysis,
  signals: ScannerSignal[],
): number {
  let confidence = 40;

  if (state.eventCount > 50) confidence += 15;
  if (state.eventCount > 200) confidence += 10;
  if (state.profileTotalVolume > 0) confidence += 10;
  if (state.recentPrices.length >= SCANNER_CONSTANTS.MIN_REGIME_SAMPLES) confidence += 10;
  if (signals.some((s) => s.severity === "HIGH")) confidence += 10;
  if (regime.regime !== "UNKNOWN") confidence += 5;

  return clamp(confidence, 0, 100);
}

function scoreToGrade(score: number): ScoreResult["grade"] {
  const t = SCANNER_CONSTANTS.GRADE_THRESHOLDS;
  if (score >= t.A_PLUS) return "A+";
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  return "F";
}

function buildRationale(
  state: SymbolState,
  regime: RegimeAnalysis,
  signals: ScannerSignal[],
  score: number,
): string {
  const parts: string[] = [];

  parts.push(`RVol ${state.relativeVolume.toFixed(2)} (${classifyRvol(state.relativeVolume).toLowerCase()} participation).`);
  parts.push(`Regime: ${regime.regime.replace(/_/g, " ").toLowerCase()} (${regime.subRegime.toLowerCase()}).`);
  parts.push(`ADR ${state.adrFilledPercent.toFixed(0)}% filled.`);

  const highSignal = signals.find((s) => s.severity === "HIGH");
  if (highSignal) {
    parts.push(highSignal.rationale);
  } else if (signals.length > 0) {
    parts.push(signals[0].rationale);
  }

  if (score >= SCANNER_CONSTANTS.GRADE_THRESHOLDS.A) {
    parts.push("Favorable scanner profile for active setups.");
  } else if (score < SCANNER_CONSTANTS.GRADE_THRESHOLDS.C) {
    parts.push("Sub-optimal conditions — reduce risk allocation.");
  }

  return parts.join(" ");
}
