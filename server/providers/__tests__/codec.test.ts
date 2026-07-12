import { describe, expect, it } from "vitest";
import { DtcBinaryCodec } from "../sierra/DtcBinaryCodec";
import { DTC_MESSAGE_TYPES, DTC_STRUCT_SIZES } from "../sierra/dtcConstants";

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
});
