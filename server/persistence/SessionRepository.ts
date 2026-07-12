import { SessionStatistics } from "../types/domain";
import { PersistedSession, RepositoryFlushResult } from "./types";

export interface SessionRepository {
  save(session: SessionStatistics): void;
  get(symbol: string): PersistedSession | undefined;
  getAll(): PersistedSession[];
  flush(): Promise<RepositoryFlushResult>;
  size(): number;
}
