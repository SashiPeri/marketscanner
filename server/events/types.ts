import { ScoredScannerResult } from "../scanner";
import { CompletedTradeLifecycle, Fill } from "../trade/types";

/** Canonical event channels on the application event bus. */
export type EventChannel =
  | "scanner:result"
  | "scanner:signal"
  | "connection:status"
  // Phase N — trade lifecycle channels
  | "trade:fill"
  | "trade:lifecycle:completed";

/** Typed payload map — extend here as new producers are added. */
export interface EventPayloadMap {
  "scanner:result": ScoredScannerResult;
  "scanner:signal": { symbol: string; signal: string; strength: number };
  "connection:status": { source: string; state: string; timestamp: string };
  // Phase N — trade lifecycle payloads
  "trade:fill": Fill;
  "trade:lifecycle:completed": CompletedTradeLifecycle;
}

export type EventHandler<T> = (payload: T) => void;

export type Unsubscribe = () => void;
