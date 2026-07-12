import fs from "fs/promises";
import path from "path";
import { Logger } from "../logging";
import { InMemoryBaselineStore } from "./InMemoryBaselineStore";
import { BaselineStoreSnapshot, SymbolBaselineRecord } from "./types";

const STORE_VERSION = 1;

/**
 * JSON file-backed baseline store.
 * File layout is designed for straightforward PostgreSQL/Redis migration.
 */
export class JsonBaselineStore extends InMemoryBaselineStore {
  constructor(
    private readonly filePath: string,
    logger: Logger,
  ) {
    super(logger);
  }

  override async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const snapshot = JSON.parse(raw) as BaselineStoreSnapshot;

      this.records.clear();
      for (const [symbol, record] of Object.entries(snapshot.symbols ?? {})) {
        this.records.set(symbol.toUpperCase(), record);
      }

      this.logger.info("Baseline store loaded from JSON", {
        path: this.filePath,
        count: this.records.size,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.logger.info("Baseline JSON not found — starting with empty store", {
          path: this.filePath,
        });
        return;
      }
      throw error;
    }
  }

  override async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const symbols: Record<string, SymbolBaselineRecord> = {};
    for (const [symbol, record] of this.records) {
      symbols[symbol] = record;
    }

    const snapshot: BaselineStoreSnapshot = {
      version: STORE_VERSION,
      updatedAt: new Date().toISOString(),
      symbols,
    };

    await fs.writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf-8");
    this.logger.info("Baseline store saved to JSON", {
      path: this.filePath,
      count: this.records.size,
    });
  }
}
