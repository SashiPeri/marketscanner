import { describe, expect, it } from "vitest";
import { HealthService, HealthServiceDeps } from "../HealthService";
import { ScannerEngine } from "../../scanner";
import { EventBus } from "../../events";
import { MarketCacheService } from "../../services/MarketCacheService";

function deps(overrides: {
  running?: boolean;
  channels?: string[];
  cacheSize?: number;
  wsAttached?: boolean;
}): HealthServiceDeps {
  const { running = true, channels = ["scanner"], cacheSize = 1, wsAttached = true } = overrides;
  return {
    config: { version: "test", buildTimestamp: "test", marketProvider: "mock" } as HealthServiceDeps["config"],
    startedAt: Date.now(),
    scannerEngine: { isRunning: () => running } as unknown as ScannerEngine,
    marketCache: { size: () => cacheSize } as unknown as MarketCacheService,
    marketProvider: {} as unknown as HealthServiceDeps["marketProvider"],
    realtimeHub: {} as unknown as HealthServiceDeps["realtimeHub"],
    realtimeServer: {} as unknown as HealthServiceDeps["realtimeServer"],
    eventBus: { channels: () => channels } as unknown as EventBus,
    persistence: {} as unknown as HealthServiceDeps["persistence"],
    websocketAttached: () => wsAttached,
  };
}

describe("HealthService.getReady", () => {
  it("reports ready when pipeline is running and carrying data", () => {
    const { ready, checks } = new HealthService(deps({})).getReady();
    expect(ready).toBe(true);
    expect(checks).toEqual({ scanner: true, eventBus: true, cache: true, websocket: true });
  });

  it("reports not-ready on a fresh boot with nothing wired", () => {
    const { ready, checks } = new HealthService(
      deps({ running: false, channels: [], cacheSize: 0, wsAttached: false }),
    ).getReady();
    expect(ready).toBe(false);
    expect(checks).toEqual({ scanner: false, eventBus: false, cache: false, websocket: false });
  });

  it("reports not-ready when wired but no market data has flowed yet", () => {
    // The honesty case: bus has channels but cache is empty — previously
    // reported ready via `size() >= 0`, presenting a data-less server as live.
    const { ready, checks } = new HealthService(deps({ cacheSize: 0 })).getReady();
    expect(ready).toBe(false);
    expect(checks.cache).toBe(false);
    expect(checks.eventBus).toBe(true);
  });

  it("reports not-ready when the scanner stops, even with cached data", () => {
    const { ready, checks } = new HealthService(deps({ running: false })).getReady();
    expect(ready).toBe(false);
    expect(checks.scanner).toBe(false);
    expect(checks.cache).toBe(true);
  });
});
