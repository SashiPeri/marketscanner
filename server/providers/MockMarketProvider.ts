import { initialMarkets } from "../mock/initialMarkets";
import { MarketData, SierraConfig, SierraSyncRequest } from "../types/market";
import { MarketProvider } from "./MarketProvider";

const MARKET_SIMULATION_INTERVAL_MS = 3000;

export class MockMarketProvider implements MarketProvider {
  private marketsState: MarketData[] = [...initialMarkets];
  private interval: NodeJS.Timeout | null = null;
  private sierraConfig: SierraConfig = {
    localPort: 8080,
    connectionType: "HTTP_SERVER",
    status: "STANDBY",
    lastSyncTime: null,
    customSymbols: [],
  };

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

        return {
          ...market,
          lastPrice: newPrice,
          netChange: newNetChange,
          pctChange: newPctChange,
          high: newPrice > market.high ? newPrice : market.high,
          low: newPrice < market.low ? newPrice : market.low,
        };
      });
    }, MARKET_SIMULATION_INTERVAL_MS);
  }

  getMarkets(): MarketData[] {
    return this.marketsState;
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
      markets: this.marketsState,
    };
  }

  disconnectSierra(): SierraConfig {
    this.sierraConfig.status = "DISCONNECTED";
    this.sierraConfig.lastSyncTime = null;
    return this.sierraConfig;
  }

  private addMockSierraSymbol(symbol: string): void {
    const symbolUpper = symbol.toUpperCase().trim();
    const exists = this.marketsState.some((market) => market.symbol === symbolUpper);
    if (!symbolUpper || exists) return;

    const basePrice = symbolUpper.includes("USD") ? 1.2500 : Math.floor(Math.random() * 200) + 50;
    const mockItem: MarketData = {
      symbol: symbolUpper,
      name: `Sierra Ticker: ${symbolUpper}`,
      category: symbolUpper.includes("USD") || symbolUpper.length === 6 ? "FOREX" : "FUTURES",
      lastPrice: basePrice,
      netChange: 0,
      pctChange: 0,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      prevClose: basePrice,
      rvol: Number((Math.random() * 1.5 + 0.4).toFixed(2)),
      atr: Number((basePrice * 0.015).toFixed(2)),
      adrFilledPct: Math.floor(Math.random() * 80) + 20,
      vah: Number((basePrice * 1.005).toFixed(2)),
      val: Number((basePrice * 0.995).toFixed(2)),
      poc: basePrice,
      regime: Math.random() > 0.5 ? "TRENDING_UP" : "RANGE_BOUND",
      probScore: Math.floor(Math.random() * 60) + 40,
      grade: "B",
      rationale: `Imported via Sierra Chart DTC/HTTP Bridge. Real-time metrics calculating on local port ${this.sierraConfig.localPort}.`,
    };

    if (mockItem.rvol > 1.4) {
      mockItem.grade = "A+";
      mockItem.probScore = 93;
      mockItem.regime = "TRENDING_UP";
    } else if (mockItem.rvol < 0.6) {
      mockItem.grade = "F";
      mockItem.probScore = 24;
      mockItem.regime = "CHOPPY";
    }

    this.marketsState.push(mockItem);
  }
}
