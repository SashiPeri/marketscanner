import { CompletedTradeLifecycle, TradePosition } from "../types";
import { LifecycleQuery, TradeLifecycleRepository } from "./TradeLifecycleRepository";

/**
 * In-memory implementation of TradeLifecycleRepository.
 *
 * Open positions are keyed by their id. Completed lifecycles are stored in
 * insertion order and indexed by id for O(1) retrieval.
 */
export class MemoryTradeLifecycleRepository implements TradeLifecycleRepository {
  /** Open positions indexed by position id. */
  private readonly openById = new Map<string, TradePosition>();
  /**
   * Secondary index: open positions by "${account}::${symbol.toUpperCase()}".
   * Allows O(1) lookup for the active position on a given account+symbol pair.
   */
  private readonly openByKey = new Map<string, TradePosition>();

  /** Completed lifecycles indexed by id. */
  private readonly completedById = new Map<string, CompletedTradeLifecycle>();
  /** Insertion-ordered list of completed lifecycles for list() queries. */
  private readonly completedOrdered: CompletedTradeLifecycle[] = [];

  // ---------------------------------------------------------------------------
  // Open positions
  // ---------------------------------------------------------------------------

  savePosition(position: TradePosition): void {
    this.openById.set(position.id, position);
    const key = this.positionKey(position.account, position.instrument.symbol);
    this.openByKey.set(key, position);
  }

  getPosition(id: string): TradePosition | undefined {
    return this.openById.get(id);
  }

  findOpenPosition(account: string, symbol: string): TradePosition | undefined {
    return this.openByKey.get(this.positionKey(account, symbol));
  }

  listOpenPositions(query: LifecycleQuery = {}): TradePosition[] {
    let rows = Array.from(this.openById.values());
    rows = this.applyQuery(rows, query, (p) => p.account, (p) => p.instrument.symbol, (p) => p.firstEntryAt);
    return rows;
  }

  removePosition(id: string): boolean {
    const position = this.openById.get(id);
    if (!position) return false;
    this.openById.delete(id);
    const key = this.positionKey(position.account, position.instrument.symbol);
    this.openByKey.delete(key);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Completed lifecycles
  // ---------------------------------------------------------------------------

  saveLifecycle(lifecycle: CompletedTradeLifecycle): void {
    if (!this.completedById.has(lifecycle.id)) {
      this.completedOrdered.push(lifecycle);
    }
    this.completedById.set(lifecycle.id, lifecycle);
  }

  getLifecycle(id: string): CompletedTradeLifecycle | undefined {
    return this.completedById.get(id);
  }

  listLifecycles(query: LifecycleQuery = {}): CompletedTradeLifecycle[] {
    let rows = this.completedOrdered as CompletedTradeLifecycle[];
    rows = this.applyQuery(rows, query, (l) => l.account, (l) => l.instrument.symbol, (l) => l.firstEntryAt);
    return rows.slice();
  }

  lifecycleCount(): number {
    return this.completedById.size;
  }

  openPositionCount(): number {
    return this.openById.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private positionKey(account: string, symbol: string): string {
    return `${account}::${symbol.toUpperCase()}`;
  }

  private applyQuery<T>(
    rows: T[],
    query: LifecycleQuery,
    getAccount: (r: T) => string,
    getSymbol: (r: T) => string,
    getTimestamp: (r: T) => string,
  ): T[] {
    if (query.account) {
      const acct = query.account;
      rows = rows.filter((r) => getAccount(r) === acct);
    }
    if (query.symbol) {
      const sym = query.symbol.toUpperCase();
      rows = rows.filter((r) => getSymbol(r).toUpperCase() === sym);
    }
    if (query.from) {
      const fromMs = Date.parse(query.from);
      if (Number.isFinite(fromMs)) {
        rows = rows.filter((r) => Date.parse(getTimestamp(r)) >= fromMs);
      }
    }
    if (query.to) {
      const toMs = Date.parse(query.to);
      if (Number.isFinite(toMs)) {
        rows = rows.filter((r) => Date.parse(getTimestamp(r)) <= toMs);
      }
    }

    const offset = Math.max(0, query.offset ?? 0);
    rows = rows.slice(offset);

    if (query.limit !== undefined && query.limit > 0) {
      rows = rows.slice(0, query.limit);
    }

    return rows;
  }
}
