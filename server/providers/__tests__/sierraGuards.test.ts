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
});
