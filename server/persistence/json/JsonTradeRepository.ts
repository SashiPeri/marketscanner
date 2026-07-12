import fs from "fs/promises";
import path from "path";
import { Logger } from "../../logging";
import { TradePrint } from "../../types/domain";
import { MemoryTradeRepository } from "../memory/MemoryTradeRepository";
import { TradeRepository } from "../TradeRepository";
import { PersistedTrade, RepositoryFlushResult } from "../types";

interface TradeFile {
  version: number;
  updatedAt: string;
  trades: Record<string, PersistedTrade[]>;
}

export class JsonTradeRepository implements TradeRepository {
  private readonly memory = new MemoryTradeRepository();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  save(trade: TradePrint): void {
    this.memory.save(trade);
  }

  get(symbol: string, limit?: number): PersistedTrade[] {
    return this.memory.get(symbol, limit);
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const trades: Record<string, PersistedTrade[]> = {};
    for (const symbol of this.memory.symbols()) {
      trades[symbol] = this.memory.get(symbol, 200);
    }

    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), trades } satisfies TradeFile),
      "utf-8",
    );

    const durationMs = Date.now() - start;
    this.logger.info("Trades flushed to JSON", { path: this.filePath, durationMs });
    return { flushed: this.memory.size(), durationMs };
  }

  size(): number {
    return this.memory.size();
  }
}
