import { OrderEvent } from "../types";

/**
 * Append-only repository for raw OrderEvent records.
 *
 * Raw storage is append-only by design — order events are immutable facts.
 * No update() or delete() operations are exposed.
 * REJECTED and CANCELED events are stored here for audit purposes only;
 * they have no effect on position state.
 */
export interface RawOrderRepository {
  /**
   * Append an order event to the raw store.
   * Throws if an event with the same id already exists.
   */
  append(event: OrderEvent): void;

  /**
   * Retrieve a single order event by its id.
   * Returns undefined when not found.
   */
  get(id: string): OrderEvent | undefined;

  /**
   * List order events filtered by account and/or symbol.
   * Returns events in chronological order (ascending providerTimestamp).
   */
  list(query?: RawOrderQuery): OrderEvent[];

  /** Total number of order events stored. */
  size(): number;
}

export interface RawOrderQuery {
  account?: string;
  symbol?: string;
  /** Include only events at or after this ISO-8601 timestamp. */
  from?: string;
  /** Include only events at or before this ISO-8601 timestamp. */
  to?: string;
  limit?: number;
}
