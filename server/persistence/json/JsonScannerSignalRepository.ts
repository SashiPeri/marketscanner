import fs from "fs/promises";
import path from "path";
import { Logger } from "../../logging";
import { ScannerSignal } from "../../types/domain";
import { MemoryScannerSignalRepository } from "../memory/MemoryScannerSignalRepository";
import { ScannerSignalRepository } from "../ScannerSignalRepository";
import { PersistedScannerSignal, RepositoryFlushResult } from "../types";

interface SignalFile {
  version: number;
  updatedAt: string;
  signals: Record<string, PersistedScannerSignal[]>;
}

export class JsonScannerSignalRepository implements ScannerSignalRepository {
  private readonly memory = new MemoryScannerSignalRepository();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  save(signal: ScannerSignal): void {
    this.memory.save(signal);
  }

  get(symbol: string, limit?: number): PersistedScannerSignal[] {
    return this.memory.get(symbol, limit);
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const signals: Record<string, PersistedScannerSignal[]> = {};
    for (const symbol of this.memory.symbols()) {
      signals[symbol] = this.memory.get(symbol, 100);
    }

    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), signals } satisfies SignalFile),
      "utf-8",
    );

    const durationMs = Date.now() - start;
    this.logger.info("Scanner signals flushed to JSON", { path: this.filePath, durationMs });
    return { flushed: this.memory.size(), durationMs };
  }

  size(): number {
    return this.memory.size();
  }
}
