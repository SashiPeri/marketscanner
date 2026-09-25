/**
 * Wire protocol spoken by acsil/MarketScannerBridge.cpp (study -> scanner).
 * Newline-delimited JSON, one object per line. Every value is validated
 * here: malformed lines are dropped with a debug log and never reach the
 * scanner engine. No product names anywhere — symbols are opaque strings.
 */

export interface AcsilHello {
  t: "hello";
  sym: string;
}

export interface AcsilTrade {
  t: "trade";
  sym: string;
  /** Provider timestamp, Unix millis (Sierra local time). */
  ts: number;
  price: number;
  size: number;
}

export interface AcsilQuote {
  t: "quote";
  sym: string;
  ts: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

export interface AcsilDepth {
  t: "depth";
  sym: string;
  ts: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export type AcsilMessage = AcsilHello | AcsilTrade | AcsilQuote | AcsilDepth;

const MAX_DEPTH_LEVELS = 50;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanSymbol(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.toUpperCase().trim();
  return cleaned.length > 0 && cleaned.length <= 32 ? cleaned : undefined;
}

function cleanPrice(value: unknown): number | undefined {
  // Zero is not a price: Sierra sends zeros when it has no data.
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function cleanSize(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 ? value : undefined;
}

function cleanLevels(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value) || value.length > MAX_DEPTH_LEVELS) return undefined;
  const levels: Array<[number, number]> = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    const price = cleanPrice(entry[0]);
    const size = cleanSize(entry[1]);
    if (price === undefined || size === undefined) return undefined;
    levels.push([price, size]);
  }
  return levels;
}

function cleanTimestamp(value: unknown): number | undefined {
  // Unix millis, sanity-bounded to 2000-01-01 .. 2100-01-01.
  return isFiniteNumber(value) && value >= 946684800000 && value <= 4102444800000 ? value : undefined;
}

/** Parse + validate one wire line. Returns undefined for anything invalid. */
export function parseAcsilLine(line: string): AcsilMessage | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const msg = raw as Record<string, unknown>;
  const sym = cleanSymbol(msg.sym);
  if (!sym || typeof msg.t !== "string") return undefined;

  switch (msg.t) {
    case "hello":
      return { t: "hello", sym };
    case "trade": {
      const ts = cleanTimestamp(msg.ts);
      const price = cleanPrice(msg.price);
      const size = cleanSize(msg.size);
      if (ts === undefined || price === undefined || size === undefined || size === 0) return undefined;
      return { t: "trade", sym, ts, price, size };
    }
    case "quote": {
      const ts = cleanTimestamp(msg.ts);
      if (ts === undefined) return undefined;
      const quote: AcsilQuote = { t: "quote", sym, ts };
      const bid = cleanPrice(msg.bid);
      const ask = cleanPrice(msg.ask);
      const bidSize = cleanSize(msg.bidSize);
      const askSize = cleanSize(msg.askSize);
      if (bid !== undefined) quote.bid = bid;
      if (ask !== undefined) quote.ask = ask;
      if (bidSize !== undefined) quote.bidSize = bidSize;
      if (askSize !== undefined) quote.askSize = askSize;
      if (quote.bid === undefined && quote.ask === undefined) return undefined;
      return quote;
    }
    case "depth": {
      const ts = cleanTimestamp(msg.ts);
      const bids = cleanLevels(msg.bids);
      const asks = cleanLevels(msg.asks);
      if (ts === undefined || bids === undefined || asks === undefined) return undefined;
      return { t: "depth", sym, ts, bids, asks };
    }
    default:
      return undefined;
  }
}
