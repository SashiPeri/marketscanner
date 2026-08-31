import { Fill } from "../types";

/**
 * Append-only repository for raw domain Fill records.
 *
 * Raw storage is append-only by design — fills are immutable facts.
 * No update() or delete() operations are exposed.
 * The derived TradeLifecycleRepository stores computed/derived views.
 */
export interface RawFillRepository {
  /**
   * Append a fill to the raw store.
   * Throws if a fill with the same id already exists.
   */
  append(fill: Fill): void;

  /**
   * Retrieve a single fill by its id.
   * Returns undefined when not found.
   */
  get(id: string): Fill | undefined;

  /**
   * List fills filtered by account and/or symbol.
   * Returns fills in chronological order (ascending providerTimestamp).
   */
  list(query?: RawFillQuery): Fill[];

  /** Total number of fills stored. */
  size(): number;
}

export interface RawFillQuery {
  account?: string;
  symbol?: string;
  /** Include only fills at or after this ISO-8601 timestamp. */
  from?: string;
  /** Include only fills at or before this ISO-8601 timestamp. */
  to?: string;
  limit?: number;
}
