import { TradePrint } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { isFiniteNumber } from "./math";
import { SymbolState } from "./SymbolState";

/**
 * Incremental volume profile histogram.
 *
 * Buckets are integer tick indices (not float prices) so POC lookup and
 * value-area expansion never fail due to IEEE-754 key mismatch.
 *
 * POC updates in O(1). VAH/VAL recalculate periodically via Market Profile
 * expansion from POC until VALUE_AREA_PERCENT of volume is captured.
 */
export function updateVolumeProfile(state: SymbolState, trade: TradePrint): void {
  if (!isFiniteNumber(trade.price) || !isFiniteNumber(trade.size) || trade.size <= 0) return;

  const bucket = state.priceToBucketIndex(trade.price);
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
    state.poc = state.bucketIndexToPrice(bucket);
  }

  state.tradesSinceVaRecalc += 1;
  if (
    state.tradesSinceVaRecalc >= SCANNER_CONSTANTS.VALUE_AREA_RECALC_INTERVAL ||
    state.vah === 0 && state.val === 0
  ) {
    recalculateValueArea(state);
    state.tradesSinceVaRecalc = 0;
  }
}

/**
 * Value Area expansion (CBOT Market Profile / Sierra Chart convention):
 * Start at POC, greedily add the adjacent level with highest volume.
 * On a tie, expand BOTH sides in the same step (institutional standard).
 * Stop when captured volume ≥ VALUE_AREA_PERCENT of total.
 */
export function recalculateValueArea(state: SymbolState): void {
  if (state.profileBuckets.size === 0 || state.profileTotalVolume <= 0) {
    const fallback = state.lastSnapshot?.lastPrice ?? state.poc;
    state.poc = isFiniteNumber(fallback) ? fallback : 0;
    state.vah = state.poc;
    state.val = state.poc;
    return;
  }

  // Integer keys — sort is stable and indexOf is exact.
  const sortedLevels = Array.from(state.profileBuckets.keys());
  sortedLevels.sort((a, b) => a - b);

  const pocIndex = findPocIndex(state, sortedLevels);
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

    // Tie: expand both sides (Market Profile / Sierra convention).
    if (nextLowVol > 0 && nextLowVol === nextHighVol && lowIdx > 0 && highIdx < sortedLevels.length - 1) {
      lowIdx -= 1;
      highIdx += 1;
      capturedVolume += nextLowVol + nextHighVol;
      continue;
    }

    if (nextLowVol > nextHighVol && lowIdx > 0) {
      lowIdx -= 1;
      capturedVolume += nextLowVol;
    } else if (nextHighVol > nextLowVol && highIdx < sortedLevels.length - 1) {
      highIdx += 1;
      capturedVolume += nextHighVol;
    } else if (lowIdx > 0 && nextLowVol >= nextHighVol) {
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

  state.val = state.bucketIndexToPrice(sortedLevels[lowIdx] ?? pocLevel);
  state.vah = state.bucketIndexToPrice(sortedLevels[highIdx] ?? pocLevel);

  if (!(state.pocVolume > 0)) {
    state.poc = state.bucketIndexToPrice(pocLevel);
    state.pocVolume = state.profileBuckets.get(pocLevel) ?? 0;
  } else {
    // Keep POC as price; ensure it still maps to a known bucket.
    state.poc = state.bucketIndexToPrice(pocLevel);
  }
}

function findPocIndex(state: SymbolState, sortedLevels: number[]): number {
  const pocBucket = state.priceToBucketIndex(state.poc);
  const exact = sortedLevels.indexOf(pocBucket);
  if (exact >= 0) return exact;

  // Fallback: highest-volume bucket (re-scan once — rare path).
  let bestIdx = 0;
  let bestVol = -1;
  for (let i = 0; i < sortedLevels.length; i++) {
    const vol = state.profileBuckets.get(sortedLevels[i]) ?? 0;
    if (vol > bestVol) {
      bestVol = vol;
      bestIdx = i;
    }
  }
  return bestIdx;
}
