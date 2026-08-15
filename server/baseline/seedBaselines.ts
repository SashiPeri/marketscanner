import { initialMarkets } from "../mock/initialMarkets";
import { MarketData } from "../types/market";
import {
  ADR_LOOKBACK_DAYS,
  ATR_LOOKBACK_DAYS,
  ADV_LOOKBACK_DAYS,
  INTRADAY_CURVE_BUCKETS,
  SymbolBaselineRecord,
} from "./types";

/** Generate a bell-shaped intraday volume curve peaking at mid-session. */
export function createDefaultIntradayCurve(buckets = INTRADAY_CURVE_BUCKETS): number[] {
  const curve: number[] = new Array(buckets);
  const mid = (buckets - 1) / 2;
  let total = 0;

  for (let i = 0; i < buckets; i++) {
    const distance = Math.abs(i - mid) / mid;
    const weight = Math.exp(-distance * distance * 2);
    curve[i] = weight;
    total += weight;
  }

  for (let i = 0; i < buckets; i++) {
    curve[i] /= total;
  }

  return curve;
}

/** Derive a baseline record from seed MarketData without external fetches. */
export function marketDataToBaselineRecord(market: MarketData): SymbolBaselineRecord {
  const price = market.lastPrice;
  const sessionRange = market.high - market.low;
  const adr14Day =
    sessionRange > 0 && market.adrFilledPct > 0
      ? sessionRange / (market.adrFilledPct / 100)
      : price * 0.015;
  const averageDailyVolume = price * 1000 * market.rvol;
  const now = new Date().toISOString();

  return {
    symbol: market.symbol.toUpperCase(),
    name: market.name,
    category: market.category,
    averageDailyVolume,
    intradayVolumeCurve: createDefaultIntradayCurve(),
    adr14Day,
    atr20Day: market.atr ?? adr14Day * 0.85,
    previousClose: market.prevClose,
    sessionStatistics: {
      averageSessionVolume: averageDailyVolume,
      averageSessionHigh: market.high,
      averageSessionLow: market.low,
      averageOpeningRange: adr14Day * 0.25,
      sessionsObserved: 1,
      lastUpdatedAt: now,
    },
    updatedAt: now,
  };
}

/** Build baseline records from the bundled initial market seed data. */
export function seedBaselinesFromInitialMarkets(): SymbolBaselineRecord[] {
  return initialMarkets.map(marketDataToBaselineRecord);
}

/** Fraction of expected daily volume elapsed at a given UTC hour/minute. */
export function cumulativeCurveFraction(
  curve: number[],
  hourUtc: number,
  minuteUtc: number,
  sessionStartHourUtc = 13,
  sessionStartMinuteUtc = 30,
  bucketMinutes = 15,
): number {
  if (curve.length === 0) return 1;
  if (!Number.isFinite(hourUtc) || !Number.isFinite(minuteUtc)) return 1;

  const sessionStartMinutes = sessionStartHourUtc * 60 + sessionStartMinuteUtc;
  const nowMinutes = hourUtc * 60 + minuteUtc;
  const elapsed = Math.max(0, nowMinutes - sessionStartMinutes);
  const bucketIndex = Math.min(curve.length - 1, Math.floor(elapsed / bucketMinutes));

  let cumulative = 0;
  for (let i = 0; i <= bucketIndex; i++) {
    cumulative += curve[i] ?? 0;
  }

  return Math.max(cumulative, curve[0] ?? 0.01);
}

export { ADR_LOOKBACK_DAYS, ATR_LOOKBACK_DAYS, ADV_LOOKBACK_DAYS };
