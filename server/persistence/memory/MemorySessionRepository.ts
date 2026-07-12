import { randomUUID } from "crypto";
import { SessionStatistics } from "../../types/domain";
import { SessionRepository } from "../SessionRepository";
import { PersistedSession, RepositoryFlushResult } from "../types";

export class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, PersistedSession>();

  save(session: SessionStatistics): void {
    const symbol = session.instrument.symbol.toUpperCase();
    this.sessions.set(symbol, {
      ...session,
      id: randomUUID(),
      persistedAt: new Date().toISOString(),
    });
  }

  get(symbol: string): PersistedSession | undefined {
    return this.sessions.get(symbol.toUpperCase());
  }

  getAll(): PersistedSession[] {
    return Array.from(this.sessions.values());
  }

  async flush(): Promise<RepositoryFlushResult> {
    const start = Date.now();
    return { flushed: this.size(), durationMs: Date.now() - start };
  }

  size(): number {
    return this.sessions.size;
  }
}
