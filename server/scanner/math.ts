/** Shared numeric helpers used across scanner calculation modules. */

const FINITE_EPS = Number.EPSILON;

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return fallback;
  if (denominator === 0) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

export function parseTimestampMs(iso?: string): number {
  if (!iso) return Date.now();
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Push into a fixed-length ring buffer, evicting the oldest entry.
 * Returns the evicted value (or undefined when the buffer was not yet full).
 */
export function pushRingBuffer(buffer: number[], value: number, maxLength: number): number | undefined {
  buffer.push(value);
  if (buffer.length > maxLength) {
    return buffer.shift();
  }
  return undefined;
}

/**
 * Ordinary-least-squares slope over evenly spaced samples.
 * Skips non-finite values but keeps original x-indices so gaps do not
 * compress the time axis. Returns 0 when fewer than 2 finite points remain.
 */
export function linearSlope(values: number[]): number {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < values.length; i++) {
    const y = values[i];
    if (!Number.isFinite(y)) continue;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
    n += 1;
  }

  if (n < 2) return 0;

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) <= FINITE_EPS) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  return Number.isFinite(slope) ? slope : 0;
}

/**
 * Wilder smoothing: newAvg = (prevAvg × (period − 1) + value) / period
 * Matches Welles Wilder / TradingView RMA when seeded correctly.
 */
export function wilderSmooth(prevAvg: number, value: number, period: number): number {
  if (!Number.isFinite(prevAvg) || !Number.isFinite(value)) return prevAvg;
  if (!Number.isFinite(period) || period <= 0) return value;
  const next = (prevAvg * (period - 1) + value) / period;
  return Number.isFinite(next) ? next : prevAvg;
}

/** Ensure high >= low; returns [high, low] with non-finite replaced by fallback. */
export function sanitizeHighLow(
  high: number,
  low: number,
  fallback: number,
): [number, number] {
  let h = Number.isFinite(high) ? high : fallback;
  let l = Number.isFinite(low) ? low : fallback;
  if (h < l) {
    const tmp = h;
    h = l;
    l = tmp;
  }
  return [h, l];
}
