import { TradePrint } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { SymbolState } from "./SymbolState";

/**
 * Incremental volume profile histogram.
 * Each trade adds volume to its price bucket; POC updates in O(1).
 * VAH/VAL are recalculated periodically (amortized) via value-area expansion from POC.
 */
export function updateVolumeProfile(state: SymbolState, trade: TradePrint): void {
  const bucket = state.priceToBucket(trade.price);
  const prevVol = state.profileBuckets.get(bucket) ?? 0;
  const newVol = prevVol + trade.size;

  state.profileBuckets.set(bucket, newVol);
  state.profileTotalVolume += trade.size;

  if (trade.aggressorSide === "BUY") {
    state.profileBuyBuckets.set(bucket, (state.profileBuyBuckets.get(bucket) ?? 0) + trade.size);
  } else if (trade.aggressorSide === "SELL") {
    state.profileSellBuckets.set(bucket, (state.profileSellBuckets.get(bucket) ?? 0) + trade.size);
  }

  if (newVol > state.pocVolume) {
    state.pocVolume = newVol;
    state.poc = bucket;
  }

  state.tradesSinceVaRecalc += 1;
  if (
    state.tradesSinceVaRecalc >= SCANNER_CONSTANTS.VALUE_AREA_RECALC_INTERVAL ||
    state.vah === 0
  ) {
    recalculateValueArea(state);
    state.tradesSinceVaRecalc = 0;
  }
}

/**
 * Value Area expansion algorithm:
 * Start at POC, greedily add adjacent price levels with highest volume
 * until 70% of total session volume is captured.
 */
export function recalculateValueArea(state: SymbolState): void {
  if (state.profileBuckets.size === 0 || state.profileTotalVolume <= 0) {
    state.poc = state.lastSnapshot?.lastPrice ?? state.poc;
    state.vah = state.poc;
    state.val = state.poc;
    return;
  }

  const sortedLevels = Array.from(state.profileBuckets.keys()).sort((a, b) => a - b);
  const pocIndex = sortedLevels.indexOf(state.poc);
  const startIdx = pocIndex >= 0 ? pocIndex : 0;
  const pocLevel = sortedLevels[startIdx];

  let lowIdx = startIdx;
  let highIdx = startIdx;
  let capturedVolume = state.profileBuckets.get(pocLevel) ?? 0;
  const targetVolume = state.profileTotalVolume * SCANNER_CONSTANTS.VALUE_AREA_PERCENT;

  while (capturedVolume < targetVolume && (lowIdx > 0 || highIdx < sortedLevels.length - 1)) {
    const nextLowVol = lowIdx > 0 ? (state.profileBuckets.get(sortedLevels[lowIdx - 1]) ?? 0) : 0;
    const nextHighVol =
      highIdx < sortedLevels.length - 1
        ? (state.profileBuckets.get(sortedLevels[highIdx + 1]) ?? 0)
        : 0;

    if (nextLowVol === 0 && nextHighVol === 0) break;

    if (nextLowVol >= nextHighVol && lowIdx > 0) {
      lowIdx -= 1;
      capturedVolume += nextLowVol;
    } else if (highIdx < sortedLevels.length - 1) {
      highIdx += 1;
      capturedVolume += nextHighVol;
    } else if (lowIdx > 0) {
      lowIdx -= 1;
      capturedVolume += nextLowVol;
    } else {
      break;
    }
  }

  state.val = sortedLevels[lowIdx] ?? pocLevel;
  state.vah = sortedLevels[highIdx] ?? pocLevel;
  if (state.poc === 0) state.poc = pocLevel;
}
