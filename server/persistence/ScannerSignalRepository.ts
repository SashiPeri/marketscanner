import { ScannerSignal } from "../types/domain";
import { PersistedScannerSignal, RepositoryFlushResult } from "./types";

export interface ScannerSignalRepository {
  save(signal: ScannerSignal): void;
  get(symbol: string, limit?: number): PersistedScannerSignal[];
  flush(): Promise<RepositoryFlushResult>;
  size(): number;
}
