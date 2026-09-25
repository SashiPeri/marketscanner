import { describe, expect, it } from "vitest";
import { SierraDtcProvider } from "../sierra/SierraDtcProvider";
import { DTC_MESSAGE_TYPES } from "../sierra/dtcConstants";
import { MarketSnapshot, TradePrint } from "../../types";

function makeProvider(): SierraDtcProvider {
  const provider = new SierraDtcProvider({
    host: "127.0.0.1",
    port: 1,
    heartbeatIntervalSeconds: 10,
    reconnectDelayMs: 5000,
    marketDataTransmissionIntervalMs: 0,
    clientName: "test",
    depthLevels: 5,
  });
  provider.on("error", () => {});
  provider.on("connectionStatus", () => {});
  // Registers the symbol without a socket (write is dropped, mapping kept).
  provider.subscribeMarketData({ symbol: "ESZ25", exchange: "CME" });
  return provider;
}

function feed(provider: SierraDtcProvider, body: Buffer): void {
  (provider as unknown as { handleData(data: Buffer): void }).handleData(body);
}

function snapshotBuffer(symbolId: number, lastPrice: number): Buffer {
  const body = Buffer.alloc(144);
  body.writeUInt16LE(144, 0);
  body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_SNAPSHOT, 2);
  body.writeUInt32LE(symbolId, 4);
  body.writeDoubleLE(lastPrice, 80);
  body.writeDoubleLE(46000, 96);
  return body;
}

function tradeBuffer(symbolId: number, price: number): Buffer {
  const body = Buffer.alloc(64);
  body.writeUInt16LE(64, 0);
  body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_TRADE, 2);
  body.writeUInt32LE(symbolId, 4);
  body.writeDoubleLE(price, 16);
  body.writeDoubleLE(3, 24);
  return body;
}

function sessionBuffer(type: number, symbolId: number, value: number): Buffer {
  const body = Buffer.alloc(32);
  body.writeUInt16LE(32, 0);
  body.writeUInt16LE(type, 2);
  body.writeUInt32LE(symbolId, 4);
  body.writeDoubleLE(value, 8);
  return body;
}

describe("SierraDtcProvider zero-data guards", () => {
  it("drops all-zero snapshots instead of publishing price 0", () => {
    const provider = makeProvider();
    const snaps: MarketSnapshot[] = [];
    provider.on("marketSnapshot", (s) => snaps.push(s));
    feed(provider, snapshotBuffer(1, 0));
    expect(snaps).toHaveLength(0);
  });

  it("publishes real snapshots after dropping empty ones", () => {
    const provider = makeProvider();
    const snaps: MarketSnapshot[] = [];
    provider.on("marketSnapshot", (s) => snaps.push(s));
    feed(provider, snapshotBuffer(1, 0));
    feed(provider, snapshotBuffer(1, 5011.0));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].lastPrice).toBe(5011.0);
  });

  it("drops zero prints and publishes real ones", () => {
    const provider = makeProvider();
    const prints: TradePrint[] = [];
    provider.on("tradePrint", (t) => prints.push(t));
    feed(provider, tradeBuffer(1, 0));
    feed(provider, tradeBuffer(1, 5012.5));
    expect(prints).toHaveLength(1);
    expect(prints[0].price).toBe(5012.5);
  });

  it("merges Sierra session high into the known snapshot", () => {
    const provider = makeProvider();
    const snaps: MarketSnapshot[] = [];
    provider.on("marketSnapshot", (s) => snaps.push(s));
    feed(provider, snapshotBuffer(1, 5011.0));
    feed(provider, sessionBuffer(DTC_MESSAGE_TYPES.MARKET_DATA_UPDATE_SESSION_HIGH, 1, 5020.5));
    expect(snaps).toHaveLength(2);
    expect(snaps[1].high).toBe(5020.5);
    expect(snaps[1].lastPrice).toBe(5011.0);
  });

  it("surfaces rejects without throwing", () => {
    const provider = makeProvider();
    const snaps: MarketSnapshot[] = [];
    provider.on("marketSnapshot", (s) => snaps.push(s));
    const body = Buffer.alloc(80);
    body.writeUInt16LE(80, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_REJECT, 2);
    body.writeUInt32LE(1, 4);
    body.write("NO_DATA", 8, "ascii");
    expect(() => feed(provider, body)).not.toThrow();
    expect(snaps).toHaveLength(0);
  });

  it("tracks per-symbol feed state: PENDING → STREAMING", () => {
    const provider = makeProvider();
    expect(provider.getSymbolFeedStates()["ESZ25"]?.status).toBe("PENDING");
    feed(provider, snapshotBuffer(1, 5011.0));
    expect(provider.getSymbolFeedStates()["ESZ25"]?.status).toBe("STREAMING");
  });

  it("records Sierra reject text per symbol", () => {
    const provider = makeProvider();
    const body = Buffer.alloc(80);
    body.writeUInt16LE(80, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.MARKET_DATA_REJECT, 2);
    body.writeUInt32LE(1, 4);
    body.write("Market data request not allowed", 8, "ascii");
    feed(provider, body);
    expect(provider.getSymbolFeedStates()["ESZ25"]).toEqual({
      status: "REJECTED",
      detail: "Market data request not allowed",
    });
  });

  it("flags unknown symbols from Sierra security definitions", () => {
    const provider = makeProvider();
    const body = Buffer.alloc(140);
    body.writeUInt16LE(140, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.SECURITY_DEFINITION_RESPONSE, 2);
    body.writeInt32LE(999, 4);
    body.write("ESZ25", 8, "ascii");
    body.writeInt32LE(0, 88);
    feed(provider, body);
    expect(provider.getSymbolFeedStates()["ESZ25"]?.status).toBe("UNKNOWN_SYMBOL");
  });

  it("resolves security definitions through the request/response cycle", async () => {
    const provider = makeProvider();
    // Fake a connected socket so the request path writes.
    (provider as unknown as { state: string }).state = "CONNECTED";
    (provider as unknown as { socket: object }).socket = { destroyed: false, write: () => true };
    const pending = provider.requestSecurityDefinition("ESZ26-CME");
    const body = Buffer.alloc(140);
    body.writeUInt16LE(140, 0);
    body.writeUInt16LE(DTC_MESSAGE_TYPES.SECURITY_DEFINITION_RESPONSE, 2);
    body.writeInt32LE(1, 4);
    body.write("ESZ26-CME", 8, "ascii");
    body.writeInt32LE(1, 88);
    body.write("E-MINI S&P 500 FUTURES", 92, "ascii");
    feed(provider, body);
    const definition = await pending;
    expect(definition.known).toBe(true);
    expect(definition.description).toBe("E-MINI S&P 500 FUTURES");
    // Second call serves from cache without a socket.
    (provider as unknown as { socket: null }).socket = null;
    await expect(provider.requestSecurityDefinition("ESZ26-CME")).resolves.toEqual(definition);
  });
});
