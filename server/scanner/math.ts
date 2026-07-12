/** Shared numeric helpers used across scanner calculation modules. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return fallback;
  return numerator / denominator;
}

export function parseTimestampMs(iso?: string): number {
  if (!iso) return Date.now();
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Push into a fixed-length ring buffer, evicting the oldest entry. */
export function pushRingBuffer(buffer: number[], value: number, maxLength: number): void {
  buffer.push(value);
  if (buffer.length > maxLength) {
    buffer.shift();
  }
}

/** Simple linear regression slope over evenly spaced samples. */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
}

/** Wilder smoothing: newAvg = (prevAvg * (period - 1) + value) / period */
export function wilderSmooth(prevAvg: number, value: number, period: number): number {
  return (prevAvg * (period - 1) + value) / period;
}
