import { TradeJournalEntry, TradeJournalQuery } from "../types";
import { TradeJournalRepository } from "../TradeJournalRepository";

export class MemoryTradeJournalRepository implements TradeJournalRepository {
  private readonly entries = new Map<string, TradeJournalEntry>();

  save(entry: TradeJournalEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): TradeJournalEntry | undefined {
    return this.entries.get(id);
  }

  list(query: TradeJournalQuery = {}): TradeJournalEntry[] {
    let rows = Array.from(this.entries.values());

    if (query.symbol) {
      const symbol = query.symbol.toUpperCase();
      rows = rows.filter((e) => e.trade.symbol === symbol);
    }
    if (query.side) {
      rows = rows.filter((e) => e.trade.side === query.side);
    }
    if (query.from) {
      const from = Date.parse(query.from);
      if (Number.isFinite(from)) {
        rows = rows.filter((e) => Date.parse(e.trade.exitTime) >= from);
      }
    }
    if (query.to) {
      const to = Date.parse(query.to);
      if (Number.isFinite(to)) {
        rows = rows.filter((e) => Date.parse(e.trade.exitTime) <= to);
      }
    }

    rows.sort((a, b) => Date.parse(b.trade.exitTime) - Date.parse(a.trade.exitTime));

    const offset = Math.max(0, query.offset ?? 0);
    const limit = query.limit !== undefined ? Math.max(0, query.limit) : undefined;
    if (limit === undefined) return rows.slice(offset);
    return rows.slice(offset, offset + limit);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }

  async flush(): Promise<{ flushed: number; durationMs: number }> {
    const start = Date.now();
    return { flushed: this.size(), durationMs: Date.now() - start };
  }

  /** Used by JSON adapter to reload. */
  replaceAll(entries: TradeJournalEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
  }

  all(): TradeJournalEntry[] {
    return Array.from(this.entries.values());
  }
}
