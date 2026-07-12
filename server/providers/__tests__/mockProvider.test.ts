import { describe, expect, it } from "vitest";
import { createLogger } from "../../logging";
import { MockMarketProvider } from "../MockMarketProvider";
import { InMemoryBaselineStore } from "../../baseline/InMemoryBaselineStore";
import { seedBaselinesFromInitialMarkets } from "../../baseline";
import { ScannerEngine } from "../../scanner/ScannerEngine";
import { MarketCacheService } from "../../services/MarketCacheService";
import { EventBus } from "../../events/EventBus";

describe("MockMarketProvider", () => {
  it("starts and returns seeded markets", () => {
    const logger = createLogger("test");
    const eventBus = new EventBus(logger);
    const store = new InMemoryBaselineStore(logger);
    store.seed(seedBaselinesFromInitialMarkets());

    const engine = new ScannerEngine(store, logger);
    const cache = new MarketCacheService(eventBus);
    const provider = new MockMarketProvider(engine, cache, logger);

    provider.start();
    const markets = provider.getMarkets();

    expect(markets.length).toBeGreaterThan(0);
    expect(provider.getSierraConfig().status).toBe("STANDBY");

    provider.stop();
  });
});
