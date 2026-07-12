import { MarketSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { safeDivide } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * ADR Filled %:
 * ADR Filled = (session high − session low) / average daily range × 100
 *
 * Values > 100% suggest range exhaustion (mean-reversion risk).
 * Values < 60% suggest runway remains for trend continuation.
 */
export function updateAdr(state: SymbolState, snapshot: MarketSnapshot): void {
  const high = snapshot.high ?? state.sessionHigh;
  const low = snapshot.low ?? state.sessionLow;
  const price = snapshot.lastPrice;

  state.applyFallbackBaselines(price);

  if (high > -Infinity && low < Infinity && high >= low) {
    const currentRange = high - low;
    state.adrFilledPercent = safeDivide(currentRange, state.averageDailyRange, 0) * 100;
  }
}

/** Whether ADR suggests exhaustion or runway. */
export function classifyAdrPosition(adrFilledPercent: number): "EXHAUSTED" | "RUNWAY" | "MID" {
  if (adrFilledPercent >= SCANNER_CONSTANTS.ADR_EXHAUSTION_PERCENT) return "EXHAUSTED";
  if (adrFilledPercent <= SCANNER_CONSTANTS.ADR_RUNWAY_PERCENT) return "RUNWAY";
  return "MID";
}

/** Seed ADR baseline from external historical data. */
export function seedAdrBaseline(state: SymbolState, adr: number): void {
  if (adr > 0) state.averageDailyRange = adr;
}

export { SCANNER_CONSTANTS };
