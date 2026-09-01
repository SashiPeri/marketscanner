import * as fs from "fs";
import * as path from "path";

export interface WatchlistSymbol {
  symbol: string;
  name?: string;
  category?: "FUTURES" | "FOREX" | "CRYPTO" | "EQUITIES";
  addedAt: string;
}

export interface WatchlistStore {
  symbols: WatchlistSymbol[];
  updatedAt: string;
}

/**
 * Persists the user's symbol universe — which symbols are tracked by the scanner.
 * Follows the same memory/json pattern as the rest of the persistence layer.
 */
export class WatchlistRepository {
  private store: WatchlistStore = { symbols: [], updatedAt: new Date().toISOString() };
  private readonly filePath: string;
  private readonly mode: "memory" | "json";

  constructor(dataDir: string, mode: "memory" | "json") {
    this.mode = mode;
    this.filePath = path.join(dataDir, "watchlist.json");
  }

  load(): void {
    if (this.mode !== "json") return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.store = JSON.parse(raw) as WatchlistStore;
      }
    } catch {
      this.store = { symbols: [], updatedAt: new Date().toISOString() };
    }
  }

  getAll(): WatchlistSymbol[] {
    return [...this.store.symbols];
  }

  getSymbols(): string[] {
    return this.store.symbols.map((s) => s.symbol);
  }

  has(symbol: string): boolean {
    return this.store.symbols.some((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
  }

  add(entry: WatchlistSymbol): void {
    if (this.has(entry.symbol)) return;
    this.store.symbols.push({ ...entry, symbol: entry.symbol.toUpperCase() });
    this.store.updatedAt = new Date().toISOString();
    this.flush();
  }

  addMany(entries: WatchlistSymbol[]): void {
    for (const e of entries) {
      if (!this.has(e.symbol)) {
        this.store.symbols.push({ ...e, symbol: e.symbol.toUpperCase() });
      }
    }
    this.store.updatedAt = new Date().toISOString();
    this.flush();
  }

  remove(symbol: string): boolean {
    const before = this.store.symbols.length;
    this.store.symbols = this.store.symbols.filter(
      (s) => s.symbol.toUpperCase() !== symbol.toUpperCase(),
    );
    const removed = this.store.symbols.length < before;
    if (removed) {
      this.store.updatedAt = new Date().toISOString();
      this.flush();
    }
    return removed;
  }

  size(): number {
    return this.store.symbols.length;
  }

  private flush(): void {
    if (this.mode !== "json") return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }
  }
}
