import { CompletedTradeLifecycle, TradePosition } from "../types";

/**
 * Repository for derived trade lifecycle objects.
 *
 * Unlike the raw repositories, this stores computed/derived views:
 * - Open TradePosition objects (mutable until closed)
 * - Completed CompletedTradeLifecycle objects (immutable once assembled)
 *
 * Derived data is recomputable from raw fills and order events, so
 * appropriate persistence operations (save, replace) are exposed here.
 */
export interface TradeLifecycleRepository {
  // --- Open positions ---

  /** Persist or replace an open position. */
  savePosition(position: TradePosition): void;

  /** Retrieve an open position by its id. */
  getPosition(id: string): TradePosition | undefined;

  /**
   * Find the open position (if any) for the given account + symbol.
   * Returns undefined when there is no open position.
   */
  findOpenPosition(account: string, symbol: string): TradePosition | undefined;

  /** List all currently open positions, optionally filtered. */
  listOpenPositions(query?: LifecycleQuery): TradePosition[];

  /** Remove an open position record (called when a position is completed). */
  removePosition(id: string): boolean;

  // --- Completed lifecycles ---

  /** Persist a completed trade lifecycle. */
  saveLifecycle(lifecycle: CompletedTradeLifecycle): void;

  /** Retrieve a completed lifecycle by its id. */
  getLifecycle(id: string): CompletedTradeLifecycle | undefined;

  /** List completed trade lifecycles, optionally filtered. */
  listLifecycles(query?: LifecycleQuery): CompletedTradeLifecycle[];

  /** Total number of completed lifecycles stored. */
  lifecycleCount(): number;

  /** Total number of open positions tracked. */
  openPositionCount(): number;
}

export interface LifecycleQuery {
  account?: string;
  symbol?: string;
  /** Include only records with a firstEntryAt at or after this ISO-8601 timestamp. */
  from?: string;
  /** Include only records with a firstEntryAt at or before this ISO-8601 timestamp. */
  to?: string;
  limit?: number;
  offset?: number;
}
