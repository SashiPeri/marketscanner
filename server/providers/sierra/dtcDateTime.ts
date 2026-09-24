const DTC_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Widest range Date.toISOString() can represent. Values outside this
// (e.g. from misaligned or corrupt wire data) must yield undefined,
// never throw inside the socket read loop.
const MAX_MS = 8_640_000_000_000_000;

function msToIso(ms: number): string | undefined {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

export function dtcDateTimeToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return msToIso(DTC_EPOCH_UTC + value * MS_PER_DAY);
}

export function dtcDateTimeIntToIso(value: bigint | number, divisor: number): string | undefined {
  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;
  return msToIso(DTC_EPOCH_UTC + (numericValue / divisor) * MS_PER_DAY);
}

export function nowIso(): string {
  return new Date().toISOString();
}
