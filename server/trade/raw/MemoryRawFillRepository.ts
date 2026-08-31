import { Fill } from "../types";
import { RawFillQuery, RawFillRepository } from "./RawFillRepository";

/**
 * In-memory implementation of RawFillRepository.
 *
 * Fills are stored in insertion order (which mirrors ascending providerTimestamp
 * when fills arrive in order from the broker). list() always returns a copy.
 */
export class MemoryRawFillRepository implements RawFillRepository {
  private readonly byId = new Map<string, Fill>();
  /** Insertion-ordered list for chronological retrieval. */
  private readonly ordered: Fill[] = [];

  append(fill: Fill): void {
    if (this.byId.has(fill.id)) {
      throw new Error(
        `MemoryRawFillRepository: duplicate fill id "${fill.id}" — raw storage is append-only`,
      );
    }
    this.byId.set(fill.id, fill);
    this.ordered.push(fill);
  }

  get(id: string): Fill | undefined {
    return this.byId.get(id);
  }

  list(query: RawFillQuery = {}): Fill[] {
    let rows = this.ordered as Fill[];

    if (query.account) {
      const acct = query.account;
      rows = rows.filter((f) => f.account === acct);
    }

    if (query.symbol) {
      const sym = query.symbol.toUpperCase();
      rows = rows.filter((f) => f.instrument.symbol.toUpperCase() === sym);
    }

    if (query.from) {
      const fromMs = Date.parse(query.from);
      if (Number.isFinite(fromMs)) {
        rows = rows.filter((f) => Date.parse(f.providerTimestamp) >= fromMs);
      }
    }

    if (query.to) {
      const toMs = Date.parse(query.to);
      if (Number.isFinite(toMs)) {
        rows = rows.filter((f) => Date.parse(f.providerTimestamp) <= toMs);
      }
    }

    if (query.limit !== undefined && query.limit > 0) {
      rows = rows.slice(0, query.limit);
    }

    // Return a copy so mutations by callers don't affect the store.
    return rows.slice();
  }

  size(): number {
    return this.byId.size;
  }
}
