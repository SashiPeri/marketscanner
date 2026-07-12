import { BaselineStore, baselineRecordToSymbolBaseline, marketDataToBaselineRecord } from "../baseline";
import { initialMarkets } from "../mock/initialMarkets";
import { Logger } from "../logging";
import { MarketSnapshot, OrderBookSnapshot, TradePrint } from "../types/domain";
import { EventPipeline } from "./EventPipeline";
import { ScoredScannerResult, ScannerResultListener, SymbolBaseline } from "./types";

/**
 * Quantitative Scanner Engine — provider-agnostic orchestrator.
 *
 * Consumes BaselineStore for ADR/RVol/ATR baselines instead of price-ratio placeholders.
 */
export class ScannerEngine {
  private readonly pipeline: EventPipeline;
  private readonly results = new Map<string, ScoredScannerResult>();
  private readonly listeners: ScannerResultListener[] = [];
  private running = true;

  constructor(
    private readonly baselineStore: BaselineStore,
    private readonly logger: Logger,
  ) {
    this.pipeline = new EventPipeline((symbol) => {
      const record = this.baselineStore.get(symbol);
      return record ? baselineRecordToSymbolBaseline(record) : undefined;
    });
  }

  /** Load baselines from store and seed the pipeline. */
  async initialize(): Promise<void> {
    await this.baselineStore.load();
    this.syncBaselinesFromStore();
    this.logger.info("Scanner engine initialized", { baselines: this.baselineStore.size() });
  }

  /** Seed or update baselines for symbols. */
  seedBaselines(baselines: SymbolBaseline[]): void {
    for (const baseline of baselines) {
      const existing = this.baselineStore.get(baseline.symbol);
      if (existing) {
        this.baselineStore.set(baseline.symbol, {
          ...existing,
          adr14Day: baseline.averageDailyRange ?? existing.adr14Day,
          averageDailyVolume: baseline.averageSessionVolume ?? existing.averageDailyVolume,
          previousClose: baseline.previousClose ?? existing.previousClose,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const market = initialMarkets.find((m) => m.symbol === baseline.symbol.toUpperCase());
        if (market) {
          this.baselineStore.set(baseline.symbol, marketDataToBaselineRecord(market));
        }
      }
    }
    this.syncBaselinesFromStore();
  }

  /** Register a downstream listener invoked after each result update. */
  onResult(listener: ScannerResultListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  onMarketSnapshot(snapshot: MarketSnapshot): ScoredScannerResult {
    const result = this.pipeline.processMarketSnapshot(snapshot);
    this.storeAndNotify(result);
    return result;
  }

  onTradePrint(trade: TradePrint): ScoredScannerResult | null {
    const result = this.pipeline.processTradePrint(trade);
    if (result) this.storeAndNotify(result);
    return result;
  }

  onOrderBookSnapshot(book: OrderBookSnapshot): ScoredScannerResult | null {
    const result = this.pipeline.processOrderBookSnapshot(book);
    if (result) this.storeAndNotify(result);
    return result;
  }

  getResult(symbol: string): ScoredScannerResult | undefined {
    return this.results.get(symbol.toUpperCase());
  }

  getAllResults(): ScoredScannerResult[] {
    return Array.from(this.results.values());
  }

  hasResult(symbol: string): boolean {
    return this.results.has(symbol.toUpperCase());
  }

  getSymbolCount(): number {
    return this.pipeline.getAllSymbols().length;
  }

  isRunning(): boolean {
    return this.running;
  }

  getBaselineStore(): BaselineStore {
    return this.baselineStore;
  }

  stop(): void {
    this.running = false;
    this.listeners.length = 0;
    this.logger.info("Scanner engine stopped");
  }

  private syncBaselinesFromStore(): void {
    const baselines: SymbolBaseline[] = [];
    for (const symbol of this.baselineStore.symbols()) {
      const record = this.baselineStore.get(symbol);
      if (record) baselines.push(baselineRecordToSymbolBaseline(record));
    }
    this.pipeline.seedBaselines(baselines);
  }

  private storeAndNotify(result: ScoredScannerResult): void {
    if (!this.running) return;

    const symbol = result.instrument.symbol.toUpperCase();
    this.results.set(symbol, result);
    for (const listener of this.listeners) {
      listener(result);
    }
  }
}
