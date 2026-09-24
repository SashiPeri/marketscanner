import { describe, expect, it } from "vitest";
import { DtcBinaryCodec } from "../sierra/DtcBinaryCodec";
import { DTC_MESSAGE_TYPES, DTC_STRUCT_SIZES } from "../sierra/dtcConstants";
import { dtcDateTimeIntToIso, dtcDateTimeToIso } from "../sierra/dtcDateTime";

describe("DtcBinaryCodec", () => {
  const codec = new DtcBinaryCodec();

  it("encodes heartbeat with correct message type", () => {
    const buffer = codec.encodeHeartbeat();
    expect(buffer.readUInt16LE(0)).toBe(DTC_STRUCT_SIZES.HEARTBEAT);
    expect(buffer.readUInt16LE(2)).toBe(DTC_MESSAGE_TYPES.HEARTBEAT);
  });

  it("encodes encoding request with binary protocol version", () => {
    const buffer = codec.encodeEncodingRequest();
    expect(buffer.readUInt16LE(2)).toBe(DTC_MESSAGE_TYPES.ENCODING_REQUEST);
    expect(buffer.readInt32LE(4)).toBeGreaterThan(0);
  });

  it("parses market snapshot at spec offsets", () => {
    // s_MarketDataSnapshot: SymbolID@4, doubles @8/16/24/32/40,
    // bid@56, ask@64, int32 AskQuantity@72/BidQuantity@76,
    // LastTradePrice@80, DateTime@96.
    const body = Buffer.alloc(144);
    body.writeUInt16LE(144, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT, 2);
    body.writeUInt32LE(7, 4);
    body.writeDoubleLE(5000.25, 8);
    body.writeDoubleLE(5010.5, 56);
    body.writeDoubleLE(5011.75, 64);
    body.writeInt32LE(12, 72);
    body.writeInt32LE(9, 76);
    body.writeDoubleLE(5011.0, 80);
    body.writeDoubleLE(46000, 96);

    const parsed = codec.parseMarketSnapshot({ size: 144, type: DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT, body });
    expect(parsed.symbolId).toBe(7);
    expect(parsed.previousClose).toBe(5000.25);
    expect(parsed.bidPrice).toBe(5010.5);
    expect(parsed.askPrice).toBe(5011.75);
    expect(parsed.askSize).toBe(12);
    expect(parsed.bidSize).toBe(9);
    expect(parsed.lastPrice).toBe(5011.0);
    expect(parsed.providerTimestamp).toMatch(/^2025-/);
  });

  it("returns id-only snapshot for truncated bodies", () => {
    const body = Buffer.alloc(40);
    body.writeUInt16LE(40, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT, 2);
    body.writeUInt32LE(7, 4);
    const parsed = codec.parseMarketSnapshot({ size: 40, type: DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT, body });
    expect(parsed).toEqual({ symbolId: 7 });
  });

  it("datetime helpers never throw on corrupt wire values", () => {
    for (const bad of [NaN, Infinity, -Infinity, 1e308, -5, 0]) {
      expect(dtcDateTimeToIso(bad)).toBeUndefined();
    }
    expect(dtcDateTimeIntToIso(BigInt(0), 1_000_000)).toBeUndefined();
    expect(dtcDateTimeIntToIso(BigInt("9999999999999999999"), 1)).toBeUndefined();
    expect(dtcDateTimeToIso(46000)).toMatch(/^2025-/);
  });
});
