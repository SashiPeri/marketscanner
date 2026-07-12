import { ScannerSignal } from "../types/domain";
import { classifyAdrPosition } from "./ADR";
import { hasDeltaDivergence } from "./Delta";
import { classifyRvol } from "./RelativeVolume";
import { nowIso } from "./math";
import { isOpeningRangeBreakoutDown, isOpeningRangeBreakoutUp } from "./SessionMetrics";
import { SymbolState } from "./SymbolState";
import { RegimeAnalysis } from "./Regime";

let signalCounter = 0;

function nextSignalId(symbol: string, type: string): string {
  signalCounter += 1;
  return `${symbol}-${type}-${signalCounter}`;
}

/**
 * Rule-based signal generation from computed metrics.
 * Signals are isolated from scoring — they describe detected conditions only.
 */
export function generateSignals(
  state: SymbolState,
  price: number,
  regime: RegimeAnalysis,
): ScannerSignal[] {
  const signals: ScannerSignal[] = [];
  const symbol = state.instrument.symbol;
  const ts = nowIso();

  if (state.vwapReclaim) {
    signals.push({
      id: nextSignalId(symbol, "vwap-reclaim"),
      instrument: state.instrument,
      direction: "LONG",
      type: "PULLBACK",
      severity: "HIGH",
      title: "VWAP Reclaim",
      rationale: "Price reclaimed VWAP on elevated volume — institutional buyers taking control.",
      referencePrice: state.vwap,
      generatedAt: ts,
    });
  }

  if (state.vwapRejection) {
    signals.push({
      id: nextSignalId(symbol, "vwap-rejection"),
      instrument: state.instrument,
      direction: "SHORT",
      type: "MEAN_REVERSION",
      severity: "HIGH",
      title: "VWAP Rejection",
      rationale: "Price rejected at VWAP on elevated volume — sellers absorbing aggressive buyers.",
      referencePrice: state.vwap,
      generatedAt: ts,
    });
  }

  if (isOpeningRangeBreakoutUp(state, price)) {
    signals.push({
      id: nextSignalId(symbol, "or-breakout-up"),
      instrument: state.instrument,
      direction: "LONG",
      type: "BREAKOUT",
      severity: "MEDIUM",
      title: "Opening Range Breakout",
      rationale: `Price broke above opening range high (${state.openingRangeHigh?.toFixed(2)}).`,
      referencePrice: state.openingRangeHigh,
      generatedAt: ts,
    });
  }

  if (isOpeningRangeBreakoutDown(state, price)) {
    signals.push({
      id: nextSignalId(symbol, "or-breakout-down"),
      instrument: state.instrument,
      direction: "SHORT",
      type: "BREAKOUT",
      severity: "MEDIUM",
      title: "Opening Range Breakdown",
      rationale: `Price broke below opening range low (${state.openingRangeLow?.toFixed(2)}).`,
      referencePrice: state.openingRangeLow,
      generatedAt: ts,
    });
  }

  if (hasDeltaDivergence(state, price)) {
    signals.push({
      id: nextSignalId(symbol, "delta-divergence"),
      instrument: state.instrument,
      direction: "SHORT",
      type: "EXHAUSTION",
      severity: "MEDIUM",
      title: "Delta Divergence",
      rationale: "New session price high without confirming cumulative delta — potential exhaustion.",
      referencePrice: price,
      generatedAt: ts,
    });
  }

  const adrClass = classifyAdrPosition(state.adrFilledPercent);
  if (adrClass === "EXHAUSTED") {
    signals.push({
      id: nextSignalId(symbol, "adr-exhaustion"),
      instrument: state.instrument,
      direction: "NEUTRAL",
      type: "EXHAUSTION",
      severity: "MEDIUM",
      title: "ADR Exhaustion",
      rationale: `Session range has filled ${state.adrFilledPercent.toFixed(0)}% of average daily range — mean-reversion risk elevated.`,
      generatedAt: ts,
    });
  }

  const rvolClass = classifyRvol(state.relativeVolume);
  if (rvolClass === "LOW") {
    signals.push({
      id: nextSignalId(symbol, "low-rvol"),
      instrument: state.instrument,
      direction: "NEUTRAL",
      type: "AVOID",
      severity: "LOW",
      title: "Low Relative Volume",
      rationale: `RVol ${state.relativeVolume.toFixed(2)} below institutional participation threshold.`,
      generatedAt: ts,
    });
  }

  if (regime.subRegime === "BREAKOUT" && rvolClass === "HIGH") {
    signals.push({
      id: nextSignalId(symbol, "vol-breakout"),
      instrument: state.instrument,
      direction: regime.regime === "TRENDING_DOWN" ? "SHORT" : "LONG",
      type: "BREAKOUT",
      severity: "HIGH",
      title: "Volume-Confirmed Breakout",
      rationale: "Breakout structure confirmed by elevated relative volume.",
      referencePrice: price,
      generatedAt: ts,
    });
  }

  return signals;
}
