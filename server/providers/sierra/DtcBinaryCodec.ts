import { finitePrice, readFixedAscii, writeFixedAscii } from "./bufferUtils";
import {
  DTC_BID_ASK,
  DTC_ENCODING,
  DTC_FINAL_UPDATE_IN_BATCH,
  DTC_MARKET_DEPTH_UPDATE_TYPE,
  DTC_MESSAGE_TYPES,
  DTC_PROTOCOL_VERSION,
  DTC_REQUEST_ACTION,
  DTC_STRUCT_SIZES,
} from "./dtcConstants";
import { dtcDateTimeIntToIso, dtcDateTimeToIso } from "./dtcDateTime";
import {
  ParsedBidAskUpdate,
  ParsedDepthLevel,
  ParsedDtcMessage,
  ParsedDtcReject,
  ParsedLogonResponse,
  ParsedMarketSnapshot,
  ParsedSessionUpdate,
  ParsedTradeUpdate,
  SessionTruthField,
  SierraDtcConfig,
} from "./sierraTypes";

function sessionFieldForType(type: number): SessionTruthField | undefined {
  switch (type) {
    case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_VOLUME: return "sessionVolume";
    case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_HIGH: return "high";
    case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_LOW: return "low";
    case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_SETTLEMENT: return "previousClose";
    case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_OPEN: return "open";
    default: return undefined;
  }
}

export class DtcBinaryCodec {
  private pending = Buffer.alloc(0);  encodeEncodingRequest(): Buffer {
    const buffer = Buffer.alloc(DTC_STRUCT_SIZES.ENCODING_REQUEST);
    buffer.writeUInt16LE(DTC_STRUCT_SIZES.ENCODING_REQUEST, 0);
    buffer.writeUInt16LE(DTC_MESSAGE_TYPES.ENCODING_REQUEST, 2);
    buffer.writeInt32LE(DTC_PROTOCOL_VERSION, 4);
    buffer.writeInt32LE(DTC_ENCODING.BINARY, 8);
    writeFixedAscii(buffer, 12, 4, "DTC");
    return buffer;
  }

  encodeLogonRequest(config: SierraDtcConfig): Buffer {
    const buffer = Buffer.alloc(DTC_STRUCT_SIZES.LOGON_REQUEST);
    buffer.writeUInt16LE(DTC_STRUCT_SIZES.LOGON_REQUEST, 0);
    buffer.writeUInt16LE(DTC_MESSAGE_TYPES.LOGON_REQUEST, 2);
    buffer.writeInt32LE(DTC_PROTOCOL_VERSION, 4);
    writeFixedAscii(buffer, 8, 32, config.username);
    writeFixedAscii(buffer, 40, 32, config.password);
    buffer.writeInt32LE(config.heartbeatIntervalSeconds, 144);
    writeFixedAscii(buffer, 248, 32, config.clientName);
    buffer.writeInt32LE(config.marketDataTransmissionIntervalMs, 280);
    return buffer;
  }

  encodeHeartbeat(): Buffer {
    const buffer = Buffer.alloc(DTC_STRUCT_SIZES.HEARTBEAT);
    buffer.writeUInt16LE(DTC_STRUCT_SIZES.HEARTBEAT, 0);
    buffer.writeUInt16LE(DTC_MESSAGE_TYPES.HEARTBEAT, 2);
    buffer.writeUInt32LE(0, 4);
    buffer.writeBigInt64LE(BigInt(0), 8);
    return buffer;
  }

  encodeMarketDataRequest(symbolId: number, symbol: string, exchange: string | undefined, subscribe: boolean): Buffer {
    const buffer = Buffer.alloc(DTC_STRUCT_SIZES.MARKET_DATA_REQUEST);
    buffer.writeUInt16LE(DTC_STRUCT_SIZES.MARKET_DATA_REQUEST, 0);
    buffer.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_REQUEST, 2);
    buffer.writeInt32LE(subscribe ? DTC_REQUEST_ACTION.SUBSCRIBE : DTC_REQUEST_ACTION.UNSUBSCRIBE, 4);
    buffer.writeUInt32LE(symbolId, 8);
    writeFixedAscii(buffer, 12, 64, symbol);
    writeFixedAscii(buffer, 76, 16, exchange);
    buffer.writeUInt32LE(0, 92);
    return buffer;
  }

  encodeMarketDepthRequest(symbolId: number, symbol: string, exchange: string | undefined, depthLevels: number, subscribe: boolean): Buffer {
    const buffer = Buffer.alloc(DTC_STRUCT_SIZES.MARKET_DEPTH_REQUEST);
    buffer.writeUInt16LE(DTC_STRUCT_SIZES.MARKET_DEPTH_REQUEST, 0);
    buffer.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DEPTH_REQUEST, 2);
    buffer.writeInt32LE(subscribe ? DTC_REQUEST_ACTION.SUBSCRIBE : DTC_REQUEST_ACTION.UNSUBSCRIBE, 4);
    buffer.writeUInt32LE(symbolId, 8);
    writeFixedAscii(buffer, 12, 64, symbol);
    writeFixedAscii(buffer, 76, 16, exchange);
    buffer.writeInt32LE(depthLevels, 92);
    return buffer;
  }

  push(data: Buffer): ParsedDtcMessage[] {
    this.pending = Buffer.concat([this.pending, data]);
    const messages: ParsedDtcMessage[] = [];

    while (this.pending.length >= DTC_STRUCT_SIZES.MESSAGE_HEADER) {
      const size = this.pending.readUInt16LE(0);
      const type = this.pending.readUInt16LE(2);

      if (size < DTC_STRUCT_SIZES.MESSAGE_HEADER) {
        this.pending = Buffer.alloc(0);
        throw new Error(`Invalid DTC message size ${size} for type ${type}.`);
      }

      if (this.pending.length < size) break;

      const body = this.pending.subarray(0, size);
      messages.push({ size, type, body });
      this.pending = this.pending.subarray(size);
    }

    return messages;
  }

  parseLogonResponse(message: ParsedDtcMessage): ParsedLogonResponse {
    return {
      result: message.body.readInt32LE(8),
      resultText: readFixedAscii(message.body, 12, 96),
      reconnectAddress: readFixedAscii(message.body, 108, 64) || undefined,
      serverName: readFixedAscii(message.body, 176, 60) || undefined,
    };
  }

  parseMarketSnapshot(message: ParsedDtcMessage): ParsedMarketSnapshot {
    const body = message.body;
    const symbolId = body.length >= 8 ? body.readUInt32LE(4) : 0;
    // s_MarketDataSnapshot shorter than the DateTime field cannot carry
    // quotes; return the id only rather than over-reading the buffer.
    if (body.length < 104) return { symbolId };
    const previousClose = finitePrice(body.readDoubleLE(8));
    const open = finitePrice(body.readDoubleLE(16));
    const high = finitePrice(body.readDoubleLE(24));
    const low = finitePrice(body.readDoubleLE(32));
    const sessionVolume = finitePrice(body.readDoubleLE(40));
    const bidPrice = finitePrice(body.readDoubleLE(56));
    const askPrice = finitePrice(body.readDoubleLE(64));
    // Quantities are int32 (AskQuantity @72, BidQuantity @76); LastTradePrice
    // is the double @80 and the snapshot DateTime double @96.
    const askSize = finitePrice(body.readInt32LE(72));
    const bidSize = finitePrice(body.readInt32LE(76));
    const lastPrice = finitePrice(body.readDoubleLE(80));

    return {
      symbolId,
      lastPrice,
      bidPrice,
      askPrice,
      bidSize,
      askSize,
      open,
      high,
      low,
      previousClose,
      sessionVolume,
      providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(96)),
    };
  }

  parseTradeUpdate(message: ParsedDtcMessage): ParsedTradeUpdate | undefined {
    const body = message.body;

    switch (message.type) {
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE:
        return {
          symbolId: body.readUInt32LE(4),
          aggressorSide: this.mapAggressorSide(body.readUInt16LE(8)),
          price: body.readDoubleLE(16),
          size: body.readDoubleLE(24),
          providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(32)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_WITH_UNBUNDLED_INDICATOR:
        return {
          symbolId: body.readUInt32LE(4),
          aggressorSide: this.mapAggressorSide(body.readUInt8(8)),
          price: body.readDoubleLE(16),
          size: body.readUInt32LE(24),
          providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(32)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_WITH_UNBUNDLED_INDICATOR_2:
        return {
          symbolId: body.readUInt32LE(4),
          price: body.readFloatLE(8),
          size: body.readUInt32LE(12),
          providerTimestamp: dtcDateTimeIntToIso(body.readBigInt64LE(16), 1_000_000),
          aggressorSide: this.mapAggressorSide(body.readUInt8(24)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_V2:
        return {
          symbolId: body.readUInt32LE(4),
          price: body.readDoubleLE(8),
          size: body.readDoubleLE(16),
          providerTimestamp: dtcDateTimeIntToIso(body.readBigInt64LE(24), 1_000_000),
          aggressorSide: this.mapAggressorSide(body.readUInt8(32)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_NO_TIMESTAMP:
        return {
          symbolId: body.readUInt32LE(4),
          price: body.readFloatLE(8),
          size: body.readUInt32LE(12),
          aggressorSide: this.mapAggressorSide(body.readUInt8(16)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE_COMPACT:
        return {
          price: body.readFloatLE(4),
          size: body.readFloatLE(8),
          providerTimestamp: dtcDateTimeToIso(body.readUInt32LE(12)),
          symbolId: body.readUInt32LE(16),
          aggressorSide: this.mapAggressorSide(body.readUInt16LE(20)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_LAST_TRADE_SNAPSHOT:
        return {
          symbolId: body.readUInt32LE(4),
          price: body.readDoubleLE(8),
          size: body.readDoubleLE(16),
          providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(24)),
        };

      default:
        return undefined;
    }
  }

  parseBidAskUpdate(message: ParsedDtcMessage): ParsedBidAskUpdate | undefined {
    const body = message.body;

    switch (message.type) {
      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK:
        return {
          symbolId: body.readUInt32LE(4),
          bidPrice: finitePrice(body.readDoubleLE(8)),
          bidSize: body.readFloatLE(16),
          askPrice: finitePrice(body.readDoubleLE(24)),
          askSize: body.readFloatLE(32),
          providerTimestamp: dtcDateTimeToIso(body.readUInt32LE(36)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_COMPACT:
        return {
          bidPrice: finitePrice(body.readFloatLE(4)),
          bidSize: body.readFloatLE(8),
          askPrice: finitePrice(body.readFloatLE(12)),
          askSize: body.readFloatLE(16),
          providerTimestamp: dtcDateTimeToIso(body.readUInt32LE(20)),
          symbolId: body.readUInt32LE(24),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_FLOAT_WITH_MICROSECONDS:
        return {
          symbolId: body.readUInt32LE(4),
          bidPrice: finitePrice(body.readFloatLE(8)),
          bidSize: body.readFloatLE(12),
          askPrice: finitePrice(body.readFloatLE(16)),
          askSize: body.readFloatLE(20),
          providerTimestamp: dtcDateTimeIntToIso(body.readBigInt64LE(24), 1_000_000),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_DOUBLE_WITH_MICROSECONDS:
        return {
          symbolId: body.readUInt32LE(4),
          bidPrice: finitePrice(body.readDoubleLE(8)),
          bidSize: body.readDoubleLE(16),
          askPrice: finitePrice(body.readDoubleLE(24)),
          askSize: body.readDoubleLE(32),
          providerTimestamp: dtcDateTimeIntToIso(body.readBigInt64LE(40), 1_000_000),
        };

      case DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_BID_ASK_NO_TIMESTAMP:
        return {
          symbolId: body.readUInt32LE(4),
          bidPrice: finitePrice(body.readFloatLE(8)),
          bidSize: body.readUInt32LE(12),
          askPrice: finitePrice(body.readFloatLE(16)),
          askSize: body.readUInt32LE(20),
        };

      default:
        return undefined;
    }
  }

  parseDepthLevel(message: ParsedDtcMessage): ParsedDepthLevel | undefined {
    const body = message.body;

    switch (message.type) {
      case DTC_MESSAGE_TYPES.MARKET_DEPTH_SNAPSHOT_LEVEL:
        return {
          symbolId: body.readUInt32LE(4),
          side: this.mapBookSide(body.readUInt16LE(8)),
          price: body.readDoubleLE(16),
          size: body.readDoubleLE(24),
          level: body.readUInt16LE(32),
          orderCount: body.readUInt32LE(48),
          isFinalUpdate: body.readUInt8(35) === 1,
          providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(40)),
        };

      case DTC_MESSAGE_TYPES.MARKET_DEPTH_SNAPSHOT_LEVEL_FLOAT:
        return {
          symbolId: body.readUInt32LE(4),
          price: body.readFloatLE(8),
          size: body.readFloatLE(12),
          orderCount: body.readUInt32LE(16),
          level: body.readUInt16LE(20),
          side: this.mapBookSide(body.readUInt8(22)),
          isFinalUpdate: body.readUInt8(23) === DTC_FINAL_UPDATE_IN_BATCH.TRUE,
        };

      case DTC_MESSAGE_TYPES.MARKET_DEPTH_UPDATE_LEVEL:
        return {
          symbolId: body.readUInt32LE(4),
          side: this.mapBookSide(body.readUInt16LE(8)),
          price: body.readDoubleLE(16),
          size: body.readDoubleLE(24),
          updateType: body.readUInt8(32),
          providerTimestamp: dtcDateTimeToIso(body.readDoubleLE(40)),
          orderCount: body.readUInt32LE(48),
          isFinalUpdate: body.readUInt8(52) === DTC_FINAL_UPDATE_IN_BATCH.TRUE,
          level: body.readUInt16LE(54),
        };

      default:
        return undefined;
    }
  }

  isDepthDelete(updateType?: number): boolean {
    return updateType === DTC_MARKET_DEPTH_UPDATE_TYPE.DELETE_LEVEL;
  }

  /**
   * s_MarketDataReject / s_MarketDepthReject: SymbolID@4, RejectText[64]@8.
   * Always safe on short bodies — returns symbol 0 + empty text.
   */
  parseReject(message: ParsedDtcMessage): ParsedDtcReject {
    const body = message.body;
    return {
      symbolId: body.length >= 8 ? body.readUInt32LE(4) : 0,
      text: body.length > 8 ? readFixedAscii(body, 8, Math.min(64, body.length - 8)) : "",
    };
  }

  /**
   * Sierra-computed session truth (the "import, don't reimplement" path):
   * 113 volume, 114 high, 115 low, 119 settlement, 120 open.
   * All carry SymbolID@4 + one double@8. Returns undefined for other types
   * or non-positive values (a zero high/low/volume is Sierra saying
   * "no data", never a fact about the market).
   */
  parseSessionUpdate(message: ParsedDtcMessage): ParsedSessionUpdate | undefined {
    const field = sessionFieldForType(message.type);
    if (!field) return undefined;
    const body = message.body;
    if (body.length < 16) return undefined;
    const value = body.readDoubleLE(8);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return { symbolId: body.readUInt32LE(4), field, value };
  }

  private mapAggressorSide(value: number): "BUY" | "SELL" | "UNKNOWN" {
    if (value === DTC_BID_ASK.AT_ASK) return "BUY";
    if (value === DTC_BID_ASK.AT_BID) return "SELL";
    return "UNKNOWN";
  }

  private mapBookSide(value: number): "BID" | "ASK" | "UNKNOWN" {
    if (value === DTC_BID_ASK.AT_BID) return "BID";
    if (value === DTC_BID_ASK.AT_ASK) return "ASK";
    return "UNKNOWN";
  }
}
