import { ScoredScannerResult } from "../scanner";

/** Canonical event channels on the application event bus. */
export type EventChannel =
  | "scanner:result"
  | "scanner:signal"
  | "connection:status";

/** Typed payload map — extend here as new producers are added. */
export interface EventPayloadMap {
  "scanner:result": ScoredScannerResult;
  "scanner:signal": { symbol: string; signal: string; strength: number };
  "connection:status": { source: string; state: string; timestamp: string };
}

export type EventHandler<T> = (payload: T) => void;

export type Unsubscribe = () => void;
