import { MarketSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { isFiniteNumber, safeDivide, sanitizeHighLow } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * ADR Filled %:
 * ADR Filled = (session high − session low) / average daily range × 100
 *
 * Values > 100% suggest range exhaustion (mean-reversion risk).
 * Values < 60% suggest runway remains for trend continuation.
 */
export function updateAdr(state: SymbolState, snapshot: MarketSnapshot): void {
  const price = snapshot.lastPrice;
  if (!isFiniteNumber(price)) return;

  state.applyFallbackBaselines(price);

  if (!(state.averageDailyRange > 0) || !isFiniteNumber(state.averageDailyRange)) return;

  const rawHigh = snapshot.high ?? (state.sessionHigh > -Infinity ? state.sessionHigh : price);
  const rawLow = snapshot.low ?? (state.sessionLow < Infinity ? state.sessionLow : price);
  const [high, low] = sanitizeHighLow(rawHigh, rawLow, price);

  if (high >= low) {
    const currentRange = high - low;
    const filled = safeDivide(currentRange, state.averageDailyRange, 0) * 100;
    state.adrFilledPercent = isFiniteNumber(filled) && filled >= 0 ? filled : 0;
  }
}

/** Whether ADR suggests exhaustion or runway. */
export function classifyAdrPosition(adrFilledPercent: number): "EXHAUSTED" | "RUNWAY" | "MID" {
  if (!isFiniteNumber(adrFilledPercent)) return "MID";
  if (adrFilledPercent >= SCANNER_CONSTANTS.ADR_EXHAUSTION_PERCENT) return "EXHAUSTED";
  if (adrFilledPercent <= SCANNER_CONSTANTS.ADR_RUNWAY_PERCENT) return "RUNWAY";
  return "MID";
}

/** Seed ADR baseline from external historical data. */
export function seedAdrBaseline(state: SymbolState, adr: number): void {
  if (adr > 0 && isFiniteNumber(adr)) state.averageDailyRange = adr;
}

export { SCANNER_CONSTANTS };
