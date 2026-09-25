import { describe, expect, it } from "vitest";
import { EventBus } from "../../../events";
import { createLogger } from "../../../logging";
import { ScannerEngine } from "../../../scanner";
import { MarketCacheService } from "../../../services/MarketCacheService";
import { MarketSnapshot, OrderBookSnapshot, TradePrint } from "../../../types/domain";
import { AcsilMessage } from "../acsilProtocol";
import { AcsilMarketProvider } from "../AcsilMarketProvider";

interface EngineStub {
  snapshots: MarketSnapshot[];
  prints: TradePrint[];
  books: OrderBookSnapshot[];
}

function makeProvider(stub: EngineStub): AcsilMarketProvider {
  const engine = {
    onMarketSnapshot: (snapshot: MarketSnapshot) => {
      stub.snapshots.push(snapshot);
      return null;
    },
    onTradePrint: (trade: TradePrint) => {
      stub.prints.push(trade);
      return null;
    },
    onOrderBookSnapshot: (book: OrderBookSnapshot) => {
      stub.books.push(book);
      return null;
    },
  } as unknown as ScannerEngine;
  const eventBus = { subscribe: () => () => undefined } as unknown as EventBus;
  const marketCache = new MarketCacheService(eventBus);
  const logger = createLogger("test");
  return new AcsilMarketProvider(engine, marketCache, logger, { port: 0, dataDir: "/tmp/opencode/acsil-test" });
}

function emit(provider: AcsilMarketProvider, message: AcsilMessage): void {
  const feed = (provider as unknown as { feed: { emit(e: string, m: AcsilMessage): void } }).feed;
  feed.emit("tick", message);
}

describe("AcsilMarketProvider", () => {
  it("turns bridge ticks into engine snapshots for any symbol", () => {
    const stub: EngineStub = { snapshots: [], prints: [], books: [] };
    const provider = makeProvider(stub);
    provider.start();

    emit(provider, { t: "hello", sym: "ESZ26-CME" });
    expect(provider.getSierraConfig().symbolStates?.["ESZ26-CME"]?.status).toBe("PENDING");

    emit(provider, { t: "trade", sym: "ESZ26-CME", ts: 1758784800123, price: 6642.5, size: 3 });
    emit(provider, {
      t: "quote", sym: "ESZ26-CME", ts: 1758784800124,
      bid: 6642.25, ask: 6642.5, bidSize: 12, askSize: 9,
    });
    emit(provider, {
      t: "depth", sym: "ESZ26-CME", ts: 1758784800125,
      bids: [[6642.25, 12]], asks: [[6642.5, 9]],
    });

    expect(stub.prints).toHaveLength(1);
    expect(stub.prints[0].price).toBe(6642.5);
    expect(stub.snapshots).toHaveLength(2);
    expect(stub.snapshots[1]).toMatchObject({ lastPrice: 6642.5, bidPrice: 6642.25, askPrice: 6642.5 });
    expect(stub.books).toHaveLength(1);
    expect(provider.getSierraConfig().symbolStates?.["ESZ26-CME"]?.status).toBe("STREAMING");
    provider.stop();
  });

  it("tracks expected symbols from sync as pending", () => {
    const stub: EngineStub = { snapshots: [], prints: [], books: [] };
    const provider = makeProvider(stub);
    const result = provider.syncSierra({ customSymbols: ["zcn26-cbot"] });
    expect(result.sierraConfig.customSymbols).toEqual(["ZCN26-CBOT"]);
    expect(result.sierraConfig.symbolStates?.["ZCN26-CBOT"]?.status).toBe("PENDING");
  });
});
