import { ServerConfig } from "../config";
import { Logger } from "../logging";
import { ScannerEngine } from "../scanner";
import { MarketCacheService } from "../services/MarketCacheService";
import { MarketProvider } from "./MarketProvider";
import { MockMarketProvider } from "./MockMarketProvider";
import { SierraMarketProviderAdapter, createSierraDtcConfig } from "./SierraMarketProviderAdapter";

export function createMarketProvider(
  config: ServerConfig,
  scannerEngine: ScannerEngine,
  marketCache: MarketCacheService,
  logger: Logger,
): MarketProvider {
  if (config.marketProvider === "sierra") {
    logger.info("Using Sierra market provider", {
      host: config.sierra.host,
      port: config.sierra.port,
    });

    const dtcConfig = createSierraDtcConfig(
      config.sierra.host,
      config.sierra.port,
      config.sierra.username,
      config.sierra.password,
    );

    return new SierraMarketProviderAdapter(dtcConfig, scannerEngine, marketCache, logger, {
      dataDir: config.dataDir,
    });
  }

  logger.info("Using mock market provider");
  return new MockMarketProvider(scannerEngine, marketCache, logger, { dataDir: config.dataDir });
}
