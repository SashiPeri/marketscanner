import { BaselineStore, createBaselineStore } from "../baseline";
import { ServerConfig } from "../config";
import { EntitlementService } from "../entitlement";
import { EventBus, ScannerEventBridge } from "../events";
import { GeminiService } from "../gemini/GeminiService";
import { HealthService } from "../health";
import { JsonTradeJournalRepository } from "../journal/json/JsonTradeJournalRepository";
import { MemoryTradeJournalRepository } from "../journal/memory/MemoryTradeJournalRepository";
import { TradeJournalServiceImpl } from "../journal/TradeJournalServiceImpl";
import { createLogger, Logger } from "../logging";
import { MetricsService } from "../metrics";
import { createPersistence, PersistenceBundle } from "../persistence";
import { createMarketProvider } from "../providers/createMarketProvider";
import { MarketProvider } from "../providers/MarketProvider";
import { RealtimeHub, RealtimeServer, DEFAULT_REALTIME_CONFIG } from "../realtime";
import { ScannerEngine } from "../scanner";
import { ScannerConfigRepository } from "../scanner/ScannerConfigRepository";
import { WatchlistRepository } from "../scanner/WatchlistRepository";
import { TradeLifecycleEngine } from "../trade/TradeLifecycleEngine";
import { TradeLifecycleRepository } from "../trade/derived/TradeLifecycleRepository";
import { RawFillRepository } from "../trade/raw/RawFillRepository";
import { RawOrderRepository } from "../trade/raw/RawOrderRepository";
import { MarketCacheService } from "./MarketCacheService";
import { MarketDataService } from "./MarketDataService";
import { SierraBridgeService } from "./SierraBridgeService";

export interface ServiceContainer {
  logger: Logger;
  config: ServerConfig;
  startedAt: number;
  eventBus: EventBus;
  scannerEngine: ScannerEngine;
  scannerBridge: ScannerEventBridge;
  baselineStore: BaselineStore;
  persistence: PersistenceBundle;
  marketCache: MarketCacheService;
  marketProvider: MarketProvider;
  marketDataService: MarketDataService;
  sierraBridgeService: SierraBridgeService;
  geminiService: GeminiService;
  realtimeHub: RealtimeHub;
  realtimeServer: RealtimeServer;
  metricsService: MetricsService;
  healthService: HealthService;
  websocketAttached: boolean;
  // V1 scanner config + watchlist
  scannerConfigRepo: ScannerConfigRepository;
  watchlistRepo: WatchlistRepository;
  entitlementService: EntitlementService;
  // V1 trade journal
  journalService: TradeJournalServiceImpl;
  // Phase N — trade lifecycle (optional until wired by a controller)
  tradeLifecycleEngine?: TradeLifecycleEngine;
  rawFillRepository?: RawFillRepository;
  rawOrderRepository?: RawOrderRepository;
  tradeLifecycleRepository?: TradeLifecycleRepository;
}

export async function createServices(config: ServerConfig): Promise<ServiceContainer> {
  const startedAt = Date.now();
  const logger = createLogger("services");
  const eventBus = new EventBus(logger.child({ component: "EventBus" }));

  const baselineStore = createBaselineStore(
    { persistence: config.persistenceMode, dataDir: config.dataDir },
    logger.child({ component: "BaselineStore" }),
  );

  const persistence = createPersistence(
    { mode: config.persistenceMode, dataDir: config.dataDir },
    logger,
  );

  const scannerEngine = new ScannerEngine(baselineStore, logger.child({ component: "ScannerEngine" }));
  await scannerEngine.initialize();

  const marketCache = new MarketCacheService(eventBus);
  const metricsService = new MetricsService();

  const scannerBridge = new ScannerEventBridge(
    scannerEngine,
    eventBus,
    persistence,
    metricsService,
    logger.child({ component: "ScannerEventBridge" }),
  );
  scannerBridge.start();

  marketCache.start();

  const marketProvider = createMarketProvider(config, scannerEngine, marketCache, logger);
  marketProvider.start();

  const realtimeHub = new RealtimeHub(
    eventBus,
    metricsService,
    logger.child({ component: "RealtimeHub" }),
    { ...DEFAULT_REALTIME_CONFIG, batchIntervalMs: config.batchIntervalMs },
  );
  realtimeHub.start();

  const realtimeServer = new RealtimeServer(
    realtimeHub,
    logger.child({ component: "RealtimeServer" }),
  );

  // V1 additions: entitlement, scanner config, watchlist, journal
  const entitlementService = new EntitlementService(config);

  const scannerConfigRepo = new ScannerConfigRepository(config.dataDir, config.persistenceMode);
  scannerConfigRepo.load();

  const watchlistRepo = new WatchlistRepository(config.dataDir, config.persistenceMode);
  watchlistRepo.load();

  const journalRepo =
    config.persistenceMode === "json"
      ? new JsonTradeJournalRepository(
          `${config.dataDir}/journal.json`,
          logger.child({ component: "TradeJournal" }),
        )
      : new MemoryTradeJournalRepository();

  // Load journal if JSON
  if (config.persistenceMode === "json" && journalRepo instanceof JsonTradeJournalRepository) {
    await journalRepo.load();
  }

  const journalService = new TradeJournalServiceImpl(journalRepo, scannerEngine, marketCache);

  const container: ServiceContainer = {
    logger,
    config,
    startedAt,
    eventBus,
    scannerEngine,
    scannerBridge,
    baselineStore,
    persistence,
    marketCache,
    marketProvider,
    marketDataService: new MarketDataService(marketProvider),
    sierraBridgeService: new SierraBridgeService(marketProvider),
    geminiService: new GeminiService(config.geminiApiKey),
    realtimeHub,
    realtimeServer,
    metricsService,
    healthService: null as unknown as HealthService,
    websocketAttached: false,
    entitlementService,
    scannerConfigRepo,
    watchlistRepo,
    journalService,
  };

  const healthService = new HealthService({
    config,
    startedAt,
    scannerEngine,
    marketCache,
    marketProvider,
    realtimeHub,
    realtimeServer,
    eventBus,
    persistence,
    websocketAttached: () => container.websocketAttached,
  });

  container.healthService = healthService;

  return container;
}
