import { EventBus } from "../events";
import { mapScannerResultToMarketData } from "../scanner";
import { MarketData } from "../types/market";

/**
 * In-memory market state cache fed by the EventBus.
 * REST endpoints and providers read from here instead of maintaining
 * their own duplicate caches.
 */
export class MarketCacheService {
  private readonly cache = new Map<string, MarketData>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly eventBus: EventBus) {}

  start(): void {
    this.unsubscribe = this.eventBus.subscribe("scanner:result", (result) => {
      const symbol = result.instrument.symbol.toUpperCase();
      const existing = this.cache.get(symbol);
      const marketData = mapScannerResultToMarketData(result, existing);
      this.cache.set(symbol, marketData);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  seed(markets: MarketData[]): void {
    for (const market of markets) {
      this.cache.set(market.symbol.toUpperCase(), { ...market });
    }
  }

  set(symbol: string, data: MarketData): void {
    this.cache.set(symbol.toUpperCase(), data);
  }

  get(symbol: string): MarketData | undefined {
    return this.cache.get(symbol.toUpperCase());
  }

  getAll(): MarketData[] {
    return Array.from(this.cache.values());
  }

  has(symbol: string): boolean {
    return this.cache.has(symbol.toUpperCase());
  }

  size(): number {
    return this.cache.size;
  }
}
