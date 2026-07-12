import fs from "fs/promises";
import path from "path";
import { Logger } from "../../logging";
import { SessionStatistics } from "../../types/domain";
import { MemorySessionRepository } from "../memory/MemorySessionRepository";
import { SessionRepository } from "../SessionRepository";
import { PersistedSession, RepositoryFlushResult } from "../types";

interface SessionFile {
  version: number;
  updatedAt: string;
  sessions: PersistedSession[];
}

export class JsonSessionRepository implements SessionRepository {
  private readonly memory = new MemorySessionRepository();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  save(session: SessionStatistics): void {
    this.memory.save(session);
  }

  get(symbol: string): PersistedSession | undefined {
    return this.memory.get(symbol);
  }

  getAll(): PersistedSession[] {
    return this.memory.getAll();
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      this.filePath,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        sessions: this.memory.getAll(),
      } satisfies SessionFile),
      "utf-8",
    );

    const durationMs = Date.now() - start;
    this.logger.info("Sessions flushed to JSON", { path: this.filePath, durationMs });
    return { flushed: this.memory.size(), durationMs };
  }

  size(): number {
    return this.memory.size();
  }
}
