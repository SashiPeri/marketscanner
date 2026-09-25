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

  it("parses reject with symbol id and reason text", () => {
    const body = Buffer.alloc(80);
    body.writeUInt16LE(80, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_REJECT, 2);
    body.writeUInt32LE(3, 4);
    body.write("NO_DATA_AVAILABLE", 8, "ascii");
    const parsed = codec.parseReject({ size: 80, type: DTC_MESSAGE_TYPES.MARKET_DATA_REJECT, body });
    expect(parsed.symbolId).toBe(3);
    expect(parsed.text).toBe("NO_DATA_AVAILABLE");
  });

  it("parses session-truth updates and rejects zero values", () => {
    const high = Buffer.alloc(32);
    high.writeUInt16LE(32, 0);
    high.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_HIGH, 2);
    high.writeUInt32LE(1, 4);
    high.writeDoubleLE(5020.5, 8);
    expect(codec.parseSessionUpdate({ size: 32, type: DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_HIGH, body: high }))
      .toEqual({ symbolId: 1, field: "high", value: 5020.5 });

    const zero = Buffer.alloc(32);
    zero.writeUInt16LE(32, 0);
    zero.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_VOLUME, 2);
    zero.writeUInt32LE(1, 4);
    zero.writeDoubleLE(0, 8);
    expect(codec.parseSessionUpdate({ size: 32, type: DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_VOLUME, body: zero }))
      .toBeUndefined();

    expect(codec.parseSessionUpdate({ size: 32, type: DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE, body: zero }))
      .toBeUndefined();
  });

  it("lists live-observed message types (open interest, feed status)", () => {
    // Seen live 2026-09-25 vs SC Build 56603: 135 streams on EURUSD,
    // 100/116 accompany empty/symbol-status episodes.
    expect(DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_OPEN_INTEREST).toBe(135);
    expect(DTC_MESSAGE_TYPES.MARKET_DATA_FEED_STATUS).toBe(100);
    expect(DTC_MESSAGE_TYPES.MARKET_DATA_FEED_SYMBOL_STATUS).toBe(116);
  });

  it("encodes security-definition + symbols-for-exchange requests", () => {
    // Live-verified 2026-09-25 vs SC Build 56603: 506 validates any symbol
    // string, 502 lists Sierra's whole universe (2689 defs observed).
    const secdef = codec.encodeSecurityDefinitionRequest(7, "ESZ26-CME");
    expect(secdef.readUInt16LE(2)).toBe(DTC_MESSAGE_TYPES.SECURITY_DEFINITION_FOR_SYMBOL_REQUEST);
    expect(secdef.readInt32LE(4)).toBe(7);
    expect(secdef.subarray(8, 8 + 9).toString("ascii")).toBe("ESZ26-CME");

    const list = codec.encodeSymbolsForExchangeRequest(9000);
    expect(list.readUInt16LE(2)).toBe(DTC_MESSAGE_TYPES.SYMBOLS_FOR_EXCHANGE_REQUEST);
    expect(list.readInt32LE(4)).toBe(9000);
  });

  it("parses security-definition responses without overrunning", () => {
    const body = Buffer.alloc(140);
    body.writeUInt16LE(140, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.SECURITY_DEFINITION_RESPONSE, 2);
    body.writeInt32LE(7, 4);
    body.write("ESZ26-CME", 8, "ascii");
    body.writeInt32LE(1, 88);
    body.write("E-MINI S&P 500 FUTURES ES Dec 2026", 92, "ascii");
    const parsed = codec.parseSecurityDefinitionResponse({ size: 140, type: 507, body });
    expect(parsed).toMatchObject({ requestId: 7, symbol: "ESZ26-CME", securityType: 1 });
    expect(parsed.description).toContain("E-MINI");

    // Unknown symbols echo back empty (bare expiry codes observed live).
    const unknown = Buffer.alloc(140);
    unknown.writeUInt16LE(140, 0);
    unknown.writeUInt16LE(507, 2);
    unknown.writeInt32LE(8, 4);
    unknown.write("ESZ26", 8, "ascii");
    const parsedUnknown = codec.parseSecurityDefinitionResponse({ size: 140, type: 507, body: unknown });
    expect(parsedUnknown).toMatchObject({ symbol: "ESZ26", securityType: 0, description: "" });
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
