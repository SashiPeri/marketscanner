import fs from "fs/promises";
import path from "path";
import { Logger } from "../../logging";
import { TRADE_JOURNAL_SCHEMA_VERSION, TradeJournalEntry, TradeJournalQuery } from "../types";
import { TradeJournalRepository } from "../TradeJournalRepository";
import { MemoryTradeJournalRepository } from "../memory/MemoryTradeJournalRepository";

interface JournalFile {
  version: number;
  updatedAt: string;
  entries: TradeJournalEntry[];
}

/**
 * JSON-backed trade journal. Hot path is in-memory; disk flush on demand/shutdown.
 */
export class JsonTradeJournalRepository implements TradeJournalRepository {
  private readonly memory = new MemoryTradeJournalRepository();
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const file = JSON.parse(raw) as JournalFile;
      this.memory.replaceAll(file.entries ?? []);
      this.logger.info("Trade journal loaded", {
        path: this.filePath,
        count: this.memory.size(),
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw error;
      this.logger.info("Trade journal file not found — starting empty", {
        path: this.filePath,
      });
    }
    this.loaded = true;
  }

  save(entry: TradeJournalEntry): void {
    this.memory.save(entry);
  }

  get(id: string): TradeJournalEntry | undefined {
    return this.memory.get(id);
  }

  list(query?: TradeJournalQuery): TradeJournalEntry[] {
    return this.memory.list(query);
  }

  delete(id: string): boolean {
    return this.memory.delete(id);
  }

  size(): number {
    return this.memory.size();
  }

  async flush(): Promise<{ flushed: number; durationMs: number }> {
    const start = Date.now();
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload: JournalFile = {
      version: TRADE_JOURNAL_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      entries: this.memory.all(),
    };
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf-8");
    const durationMs = Date.now() - start;
    this.logger.info("Trade journal flushed", {
      path: this.filePath,
      flushed: payload.entries.length,
      durationMs,
    });
    return { flushed: payload.entries.length, durationMs };
  }
}
