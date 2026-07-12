import { describe, expect, it } from "vitest";
import { createLogger } from "../../logging";
import { InMemoryBaselineStore } from "../../baseline/InMemoryBaselineStore";
import { seedBaselinesFromInitialMarkets, marketDataToBaselineRecord } from "../../baseline";
import { initialMarkets } from "../../mock/initialMarkets";

describe("SierraMarketProviderAdapter mapping", () => {
  it("maps market data to baseline records for scanner seeding", () => {
    const record = marketDataToBaselineRecord(initialMarkets[0]);
    expect(record.symbol).toBe("ES");
    expect(record.adr14Day).toBeGreaterThan(0);
    expect(record.intradayVolumeCurve.length).toBeGreaterThan(0);
  });

  it("loads baselines from in-memory store", async () => {
    const logger = createLogger("test");
    const store = new InMemoryBaselineStore(logger);
    store.seed(seedBaselinesFromInitialMarkets());

    await store.load();
    expect(store.get("ES")).toBeDefined();
    expect(store.size()).toBe(initialMarkets.length);
  });
});
