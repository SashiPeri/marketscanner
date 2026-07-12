import { initialMarkets } from "../mock/initialMarkets";
import { Logger } from "../logging";
import {
  marketDataToBaseline,
  mapScannerResultToMarketData,
  ScannerEngine,
} from "../scanner";
import { MarketCacheService } from "../services/MarketCacheService";
import { InstrumentIdentity, MarketSnapshot } from "../types/domain";
import { MarketData, SierraConfig, SierraSyncRequest } from "../types/market";
import { MarketProvider } from "./MarketProvider";

const MARKET_SIMULATION_INTERVAL_MS = 3000;

export class MockMarketProvider implements MarketProvider {
  private marketsState: MarketData[] = [...initialMarkets];
  private readonly scannerEngine: ScannerEngine;
  private readonly marketCache: MarketCacheService;
  private readonly logger: Logger;
  private interval: NodeJS.Timeout | null = null;
  private sierraConfig: SierraConfig = {
    localPort: 8080,
    connectionType: "HTTP_SERVER",
    status: "STANDBY",
    lastSyncTime: null,
    customSymbols: [],
  };

  constructor(scannerEngine: ScannerEngine, marketCache: MarketCacheService, logger: Logger) {
    this.scannerEngine = scannerEngine;
    this.marketCache = marketCache;
    this.logger = logger.child({ component: "MockMarketProvider" });
    this.scannerEngine.seedBaselines(initialMarkets.map(marketDataToBaseline));
    this.marketCache.seed(initialMarkets);

    for (const market of initialMarkets) {
      this.seedScannerState(market);
    }
  }

  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.marketsState = this.marketsState.map((market) => {
        const changePercent = (Math.random() - 0.495) * 0.001;
        const priceChange = market.lastPrice * changePercent;
        const precision = market.category === "FOREX" ? 4 : 2;
        const newPrice = Number((market.lastPrice + priceChange).toFixed(precision));
        const newNetChange = Number((market.netChange + priceChange).toFixed(precision));
        const newPctChange = Number(((newNetChange / market.open) * 100).toFixed(2));
        const newHigh = newPrice > market.high ? newPrice : market.high;
        const newLow = newPrice < market.low ? newPrice : market.low;

        const snapshot: MarketSnapshot = {
          instrument: this.toInstrument(market),
          lastPrice: newPrice,
          open: market.open,
          high: newHigh,
          low: newLow,
          previousClose: market.prevClose,
          netChange: newNetChange,
          percentChange: newPctChange,
          receivedAt: new Date().toISOString(),
        };

        this.scannerEngine.onMarketSnapshot(snapshot);
        return this.marketCache.get(market.symbol) ?? market;
      });
    }, MARKET_SIMULATION_INTERVAL_MS);

    this.logger.info("Mock market provider started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info("Mock market provider stopped");
    }
  }

  getMarkets(): MarketData[] {
    return this.marketCache.getAll();
  }

  getSierraConfig(): SierraConfig {
    return this.sierraConfig;
  }

  syncSierra(params: SierraSyncRequest): { sierraConfig: SierraConfig; markets: MarketData[] } {
    const { localPort, connectionType, customSymbols } = params;

    if (localPort) this.sierraConfig.localPort = Number(localPort);
    if (connectionType) this.sierraConfig.connectionType = connectionType;

    this.sierraConfig.status = "CONNECTED";
    this.sierraConfig.lastSyncTime = new Date().toISOString();

    if (customSymbols && Array.isArray(customSymbols) && customSymbols.length > 0) {
      this.sierraConfig.customSymbols = customSymbols;
      customSymbols.forEach((symbol) => this.addMockSierraSymbol(symbol));
    }

    return {
      sierraConfig: this.sierraConfig,
      markets: this.getMarkets(),
    };
  }

  disconnectSierra(): SierraConfig {
    this.sierraConfig.status = "DISCONNECTED";
    this.sierraConfig.lastSyncTime = null;
    return this.sierraConfig;
  }

  private seedScannerState(market: MarketData): void {
    const snapshot: MarketSnapshot = {
      instrument: this.toInstrument(market),
      lastPrice: market.lastPrice,
      open: market.open,
      high: market.high,
      low: market.low,
      previousClose: market.prevClose,
      netChange: market.netChange,
      percentChange: market.pctChange,
      receivedAt: new Date().toISOString(),
    };
    this.scannerEngine.onMarketSnapshot(snapshot);
  }

  private toInstrument(market: MarketData): InstrumentIdentity {
    const assetClassMap: Record<MarketData["category"], InstrumentIdentity["assetClass"]> = {
      FUTURES: "FUTURES",
      FOREX: "FOREX",
      CRYPTO: "CRYPTO",
      EQUITIES: "EQUITIES",
    };

    return {
      symbol: market.symbol,
      name: market.name,
      assetClass: assetClassMap[market.category],
    };
  }

  private addMockSierraSymbol(symbol: string): void {
    const symbolUpper = symbol.toUpperCase().trim();
    const exists = this.marketsState.some((market) => market.symbol === symbolUpper);
    if (!symbolUpper || exists) return;

    const basePrice = symbolUpper.includes("USD") ? 1.2500 : Math.floor(Math.random() * 200) + 50;
    const snapshot: MarketSnapshot = {
      instrument: {
        symbol: symbolUpper,
        name: `Sierra Ticker: ${symbolUpper}`,
        assetClass: symbolUpper.includes("USD") || symbolUpper.length === 6 ? "FOREX" : "FUTURES",
      },
      lastPrice: basePrice,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      previousClose: basePrice,
      receivedAt: new Date().toISOString(),
    };

    const result = this.scannerEngine.onMarketSnapshot(snapshot);
    const mockItem = mapScannerResultToMarketData(result);
    mockItem.name = `Sierra Ticker: ${symbolUpper}`;

    this.marketsState.push(mockItem);
    this.marketCache.set(symbolUpper, mockItem);
    this.scannerEngine.seedBaselines([marketDataToBaseline(mockItem)]);
  }
}
