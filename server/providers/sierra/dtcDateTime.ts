const DTC_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dtcDateTimeToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return new Date(DTC_EPOCH_UTC + value * MS_PER_DAY).toISOString();
}

export function dtcDateTimeIntToIso(value: bigint | number, divisor: number): string | undefined {
  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;
  return new Date(DTC_EPOCH_UTC + (numericValue / divisor) * MS_PER_DAY).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}
