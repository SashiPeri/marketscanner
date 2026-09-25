import { Logger } from "../logging";
import { ScannerEngine } from "../scanner";
import { MarketCacheService } from "../services/MarketCacheService";
import { ConnectionStatus, MarketSnapshot } from "../types/domain";
import { MarketData, SierraConfig, SierraSyncRequest } from "../types/market";
import { loadCustomSymbols, saveCustomSymbols } from "./customSymbolsStore";
import { MarketProvider } from "./MarketProvider";
import { SierraDtcProvider } from "./sierra/SierraDtcProvider";
import { SierraDtcConfig } from "./sierra/sierraTypes";

const DEFAULT_DTC_CONFIG: Omit<SierraDtcConfig, "host" | "port" | "username" | "password"> = {
  heartbeatIntervalSeconds: 10,
  reconnectDelayMs: 5000,
  marketDataTransmissionIntervalMs: 0,
  clientName: "MarketScanner",
  depthLevels: 10,
};

export class SierraMarketProviderAdapter implements MarketProvider {
  private readonly scannerEngine: ScannerEngine;
  private readonly marketCache: MarketCacheService;
  private readonly logger: Logger;
  private dtcProvider: SierraDtcProvider;
  private readonly dtcConfig: SierraDtcConfig;
  private readonly dataDir: string;
  private sierraConfig: SierraConfig;
  private eventsBound = false;

  constructor(
    dtcConfig: SierraDtcConfig,
    scannerEngine: ScannerEngine,
    marketCache: MarketCacheService,
    logger: Logger,
    options?: { dataDir?: string },
  ) {
    this.dtcConfig = { ...dtcConfig };
    this.scannerEngine = scannerEngine;
    this.marketCache = marketCache;
    this.logger = logger.child({ component: "SierraMarketProviderAdapter" });
    this.dtcProvider = new SierraDtcProvider(this.dtcConfig);
    this.dataDir = options?.dataDir ?? "data";
    this.sierraConfig = {
      localPort: dtcConfig.port,
      connectionType: "DTC_PROTOCOL",
      status: "STANDBY",
      lastSyncTime: null,
      // Restored from disk — no longer lost on restart.
      customSymbols: loadCustomSymbols(this.dataDir),
    };

    // Sierra mode starts EMPTY: no mock seeding. A symbol appears in the
    // cache only after genuine DTC data reaches the scanner engine.
    // NO DATA must never look like a plausible market.
  }

  start(): void {
    this.bindDtcEvents();
    // Auto-restore: previously subscribed products reconnect without a
    // manual sync call. With no restored symbols, stay STANDBY as before.
    if (this.sierraConfig.customSymbols.length > 0) {
      for (const symbol of this.sierraConfig.customSymbols) {
        this.subscribeSymbol(symbol);
      }
      this.sierraConfig.status = "STANDBY";
      this.dtcProvider.connect();
    }
  }

  stop(): void {
    this.dtcProvider.disconnect();
    this.sierraConfig.status = "DISCONNECTED";
    this.logger.info("Sierra provider stopped");
  }

  getMarkets(): MarketData[] {
    return this.marketCache.getAll();
  }

  getSierraConfig(): SierraConfig {
    return { ...this.sierraConfig, symbolStates: this.dtcProvider.getSymbolFeedStates() };
  }

  syncSierra(params: SierraSyncRequest): { sierraConfig: SierraConfig; markets: MarketData[] } {
    const { localPort, connectionType, customSymbols } = params;

    if (localPort) {
      this.sierraConfig.localPort = Number(localPort);
      this.dtcConfig.port = Number(localPort);
    }
    if (connectionType) this.sierraConfig.connectionType = connectionType;

    this.sierraConfig.lastSyncTime = new Date().toISOString();

    if (customSymbols && Array.isArray(customSymbols) && customSymbols.length > 0) {
      this.sierraConfig.customSymbols = customSymbols.map((symbol) => symbol.toUpperCase().trim());
      saveCustomSymbols(this.dataDir, this.sierraConfig.customSymbols);
      for (const symbol of this.sierraConfig.customSymbols) {
        this.subscribeSymbol(symbol);
      }
    }

    const connectionStatus = this.dtcProvider.getConnectionStatus();
    if (connectionStatus.state === "DISCONNECTED" || connectionStatus.state === "ERROR") {
      this.sierraConfig.status = "STANDBY";
      this.dtcProvider.connect();
    } else if (connectionStatus.state === "CONNECTED") {
      this.sierraConfig.status = "CONNECTED";
    }

    return {
      sierraConfig: this.getSierraConfig(),
      markets: this.getMarkets(),
    };
  }

  disconnectSierra(): SierraConfig {
    this.dtcProvider.disconnect();
    this.sierraConfig.status = "DISCONNECTED";
    this.sierraConfig.lastSyncTime = null;
    return this.getSierraConfig();
  }

  private bindDtcEvents(): void {
    if (this.eventsBound) return;
    this.eventsBound = true;

    this.dtcProvider.on("marketSnapshot", (snapshot) => this.handleMarketSnapshot(snapshot));
    this.dtcProvider.on("tradePrint", (trade) => this.scannerEngine.onTradePrint(trade));
    this.dtcProvider.on("orderBookSnapshot", (book) => this.scannerEngine.onOrderBookSnapshot(book));
    this.dtcProvider.on("connectionStatus", (status) => this.handleConnectionStatus(status));
    this.dtcProvider.on("error", (error) => {
      this.logger.error("DTC error", { message: error.message });
    });
  }

  private handleMarketSnapshot(snapshot: MarketSnapshot): void {
    this.scannerEngine.onMarketSnapshot(snapshot);
  }

  private handleConnectionStatus(status: ConnectionStatus): void {
    this.sierraConfig.status = this.mapConnectionState(status.state);
    if (status.state === "CONNECTED" && !this.sierraConfig.lastSyncTime) {
      this.sierraConfig.lastSyncTime = status.connectedAt ?? new Date().toISOString();
    }
    // On (re)connect, ask Sierra itself what each requested symbol is.
    // Unknown strings (wrong suffix, expired alias) are flagged as
    // UNKNOWN_SYMBOL; exchange-restricted products surface Sierra's reject
    // text via the subscription path. No product list lives in this repo.
    if (status.state === "CONNECTED") {
      this.validateSymbols();
    }
  }

  private validateSymbols(): void {
    for (const symbol of this.sierraConfig.customSymbols) {
      this.dtcProvider.requestSecurityDefinition(symbol).then(
        (definition) => {
          if (definition.known) {
            this.logger.info("Sierra symbol validated", {
              symbol,
              description: definition.description,
            });
          }
        },
        (error: Error) => {
          this.logger.debug("Sierra symbol validation skipped", {
            symbol,
            message: error.message,
          });
        },
      );
    }
  }

  private mapConnectionState(state: ConnectionStatus["state"]): SierraConfig["status"] {
    if (state === "CONNECTED") return "CONNECTED";
    if (state === "CONNECTING" || state === "RECONNECTING") return "STANDBY";
    return "DISCONNECTED";
  }

  private subscribeSymbol(symbol: string): void {
    const symbolUpper = symbol.toUpperCase().trim();
    if (!symbolUpper) return;

    // No synthetic seed snapshot: subscribing only registers DTC interest.
    // The symbol becomes visible once real data arrives from the feed.
    // Fabricating basePrice/open/high/low here would present NO DATA
    // as a tradeable market.
    this.dtcProvider.subscribeMarketData({ symbol: symbolUpper });
  }
}

export function createSierraDtcConfig(
  host: string,
  port: number,
  username?: string,
  password?: string,
): SierraDtcConfig {
  return {
    host,
    port,
    username,
    password,
    ...DEFAULT_DTC_CONFIG,
  };
}
