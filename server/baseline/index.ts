import { BaselineStore } from "./BaselineStore";
import { InMemoryBaselineStore } from "./InMemoryBaselineStore";
import { JsonBaselineStore } from "./JsonBaselineStore";
import { marketDataToBaselineRecord, seedBaselinesFromInitialMarkets } from "./seedBaselines";
import { SymbolBaselineRecord } from "./types";

export type { BaselineStore } from "./BaselineStore";
export { InMemoryBaselineStore } from "./InMemoryBaselineStore";
export { JsonBaselineStore } from "./JsonBaselineStore";
export {
  createDefaultIntradayCurve,
  cumulativeCurveFraction,
  marketDataToBaselineRecord,
  seedBaselinesFromInitialMarkets,
} from "./seedBaselines";
export type { BaselineSessionStats, SymbolBaselineRecord, BaselineStoreSnapshot } from "./types";

export function createBaselineStore(
  options: { persistence: "memory" | "json"; dataDir: string },
  logger: import("../logging").Logger,
): BaselineStore {
  if (options.persistence === "json") {
    const filePath = `${options.dataDir}/baselines.json`;
    const store = new JsonBaselineStore(filePath, logger);
    store.seed(seedBaselinesFromInitialMarkets());
    return store;
  }

  const store = new InMemoryBaselineStore(logger);
  store.seed(seedBaselinesFromInitialMarkets());
  return store;
}

/** Map a baseline record to the legacy SymbolBaseline shape used by SymbolState. */
export function baselineRecordToSymbolBaseline(record: SymbolBaselineRecord): import("../scanner/types").SymbolBaseline {
  return {
    symbol: record.symbol,
    name: record.name,
    category: record.category,
    averageDailyRange: record.adr14Day,
    averageSessionVolume: record.averageDailyVolume,
    previousClose: record.previousClose,
    averageTrueRange: record.atr20Day,
    intradayVolumeCurve: record.intradayVolumeCurve,
  };
}
