import { Logger } from "../logging";
import { JsonMarketSnapshotRepository } from "./json/JsonMarketSnapshotRepository";
import { JsonScannerSignalRepository } from "./json/JsonScannerSignalRepository";
import { JsonSessionRepository } from "./json/JsonSessionRepository";
import { JsonTradeRepository } from "./json/JsonTradeRepository";
import { MemoryMarketSnapshotRepository } from "./memory/MemoryMarketSnapshotRepository";
import { MemoryScannerSignalRepository } from "./memory/MemoryScannerSignalRepository";
import { MemorySessionRepository } from "./memory/MemorySessionRepository";
import { MemoryTradeRepository } from "./memory/MemoryTradeRepository";
import { MarketSnapshotRepository } from "./MarketSnapshotRepository";
import { ScannerSignalRepository } from "./ScannerSignalRepository";
import { SessionRepository } from "./SessionRepository";
import { TradeRepository } from "./TradeRepository";

export type { MarketSnapshotRepository } from "./MarketSnapshotRepository";
export type { TradeRepository } from "./TradeRepository";
export type { ScannerSignalRepository } from "./ScannerSignalRepository";
export type { SessionRepository } from "./SessionRepository";
export { MemoryMarketSnapshotRepository } from "./memory/MemoryMarketSnapshotRepository";
export { MemoryTradeRepository } from "./memory/MemoryTradeRepository";
export { MemoryScannerSignalRepository } from "./memory/MemoryScannerSignalRepository";
export { MemorySessionRepository } from "./memory/MemorySessionRepository";
export { JsonMarketSnapshotRepository } from "./json/JsonMarketSnapshotRepository";
export { JsonTradeRepository } from "./json/JsonTradeRepository";
export { JsonScannerSignalRepository } from "./json/JsonScannerSignalRepository";
export { JsonSessionRepository } from "./json/JsonSessionRepository";

export interface PersistenceBundle {
  marketSnapshots: MarketSnapshotRepository;
  trades: TradeRepository;
  signals: ScannerSignalRepository;
  sessions: SessionRepository;
}

export function createPersistence(
  options: { mode: "memory" | "json"; dataDir: string },
  logger: Logger,
): PersistenceBundle {
  if (options.mode === "json") {
    const log = logger.child({ component: "persistence" });
    return {
      marketSnapshots: new JsonMarketSnapshotRepository(`${options.dataDir}/snapshots.json`, log),
      trades: new JsonTradeRepository(`${options.dataDir}/trades.json`, log),
      signals: new JsonScannerSignalRepository(`${options.dataDir}/signals.json`, log),
      sessions: new JsonSessionRepository(`${options.dataDir}/sessions.json`, log),
    };
  }

  return {
    marketSnapshots: new MemoryMarketSnapshotRepository(),
    trades: new MemoryTradeRepository(),
    signals: new MemoryScannerSignalRepository(),
    sessions: new MemorySessionRepository(),
  };
}

export async function flushAllPersistence(bundle: PersistenceBundle): Promise<void> {
  await Promise.all([
    bundle.marketSnapshots.flush(),
    bundle.trades.flush(),
    bundle.signals.flush(),
    bundle.sessions.flush(),
  ]);
}
