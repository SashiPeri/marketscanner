import fs from "fs/promises";
import path from "path";
import { Logger } from "../../logging";
import { MarketSnapshot } from "../../types/domain";
import { MarketSnapshotRepository } from "../MarketSnapshotRepository";
import { MemoryMarketSnapshotRepository } from "../memory/MemoryMarketSnapshotRepository";
import { PersistedMarketSnapshot, RepositoryFlushResult } from "../types";

interface SnapshotFile {
  version: number;
  updatedAt: string;
  snapshots: Record<string, PersistedMarketSnapshot[]>;
}

/**
 * JSON-backed market snapshot repository.
 * OPTIMIZATION: in-memory Map is the hot path; JSON flush is deferred to shutdown.
 */
export class JsonMarketSnapshotRepository implements MarketSnapshotRepository {
  private readonly memory = new MemoryMarketSnapshotRepository();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  save(snapshot: MarketSnapshot): void {
    this.memory.save(snapshot);
  }

  get(symbol: string, limit?: number): PersistedMarketSnapshot[] {
    return this.memory.get(symbol, limit);
  }

  getLatest(symbol: string): PersistedMarketSnapshot | undefined {
    return this.memory.getLatest(symbol);
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const snapshots: Record<string, PersistedMarketSnapshot[]> = {};
    for (const symbol of this.getSymbols()) {
      snapshots[symbol] = this.memory.get(symbol, 50);
    }

    const payload: SnapshotFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      snapshots,
    };

    await fs.writeFile(this.filePath, JSON.stringify(payload), "utf-8");
    const durationMs = Date.now() - start;
    this.logger.info("Market snapshots flushed to JSON", { path: this.filePath, durationMs });
    return { flushed: this.memory.size(), durationMs };
  }

  size(): number {
    return this.memory.size();
  }

  private getSymbols(): string[] {
    return this.memory.symbols();
  }
}
