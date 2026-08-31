import { OrderEvent } from "../types";
import { RawOrderQuery, RawOrderRepository } from "./RawOrderRepository";

/**
 * In-memory implementation of RawOrderRepository.
 *
 * Order events are stored in insertion order. list() always returns a copy.
 * REJECTED and CANCELED events are stored for audit — they carry no
 * position-affecting semantics.
 */
export class MemoryRawOrderRepository implements RawOrderRepository {
  private readonly byId = new Map<string, OrderEvent>();
  /** Insertion-ordered list for chronological retrieval. */
  private readonly ordered: OrderEvent[] = [];

  append(event: OrderEvent): void {
    if (this.byId.has(event.id)) {
      throw new Error(
        `MemoryRawOrderRepository: duplicate order event id "${event.id}" — raw storage is append-only`,
      );
    }
    this.byId.set(event.id, event);
    this.ordered.push(event);
  }

  get(id: string): OrderEvent | undefined {
    return this.byId.get(id);
  }

  list(query: RawOrderQuery = {}): OrderEvent[] {
    let rows = this.ordered as OrderEvent[];

    if (query.account) {
      const acct = query.account;
      rows = rows.filter((e) => e.account === acct);
    }

    if (query.symbol) {
      const sym = query.symbol.toUpperCase();
      rows = rows.filter((e) => e.instrument.symbol.toUpperCase() === sym);
    }

    if (query.from) {
      const fromMs = Date.parse(query.from);
      if (Number.isFinite(fromMs)) {
        rows = rows.filter((e) => Date.parse(e.providerTimestamp) >= fromMs);
      }
    }

    if (query.to) {
      const toMs = Date.parse(query.to);
      if (Number.isFinite(toMs)) {
        rows = rows.filter((e) => Date.parse(e.providerTimestamp) <= toMs);
      }
    }

    if (query.limit !== undefined && query.limit > 0) {
      rows = rows.slice(0, query.limit);
    }

    return rows.slice();
  }

  size(): number {
    return this.byId.size;
  }
}
