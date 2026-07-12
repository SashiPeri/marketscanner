import { describe, expect, it } from "vitest";
import { InMemoryBaselineStore } from "../../baseline/InMemoryBaselineStore";
import { createLogger } from "../../logging";
import { seedBaselinesFromInitialMarkets } from "../../baseline";
import { ScannerEngine } from "../ScannerEngine";

describe("ScannerEngine", () => {
  it("processes market snapshots using BaselineStore baselines", async () => {
    const logger = createLogger("test");
    const store = new InMemoryBaselineStore(logger);
    store.seed(seedBaselinesFromInitialMarkets());

    const engine = new ScannerEngine(store, logger);
    await engine.initialize();

    const result = engine.onMarketSnapshot({
      instrument: { symbol: "ES", assetClass: "FUTURES" },
      lastPrice: 5125,
      open: 5084,
      high: 5130,
      low: 5078,
      sessionVolume: 1_500_000,
      receivedAt: new Date().toISOString(),
    });

    expect(result.instrument.symbol).toBe("ES");
    expect(result.metrics.relativeVolume).toBeGreaterThan(0);
    expect(result.metrics.adrFilledPercent).toBeGreaterThan(0);
    expect(engine.hasResult("ES")).toBe(true);
  });
});
