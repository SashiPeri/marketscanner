import { ClientSubscription } from "./types";

function normalizeSymbols(symbols: string[]): Set<string> {
  return new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean));
}

function subscriptionKey(sub: ClientSubscription): string {
  switch (sub.kind) {
    case "symbol":
      return `symbol:${[...normalizeSymbols(sub.symbols)].sort().join(",")}`;
    case "watchlist":
      return `watchlist:${sub.watchlistId}:${[...normalizeSymbols(sub.symbols)].sort().join(",")}`;
    case "all":
      return "all";
    case "channel":
      return `channel:${sub.channel}`;
  }
}

/**
 * Tracks per-connection subscription state.
 * A client only receives updates for symbols it has explicitly subscribed to.
 */
export class SubscriptionManager {
  private readonly subscriptions = new Set<ClientSubscription>();
  private symbolSet = new Set<string>();
  private receivesAll = false;
  private channels = new Set<string>();

  subscribe(sub: ClientSubscription): void {
    this.subscriptions.add(sub);
    this.rebuildIndex();
  }

  unsubscribe(sub: ClientSubscription): void {
    const key = subscriptionKey(sub);
    for (const existing of this.subscriptions) {
      if (subscriptionKey(existing) === key) {
        this.subscriptions.delete(existing);
        break;
      }
    }
    this.rebuildIndex();
  }

  unsubscribeAll(): void {
    this.subscriptions.clear();
    this.symbolSet.clear();
    this.receivesAll = false;
    this.channels.clear();
  }

  /** Whether this connection should receive an update for the given symbol. */
  matchesSymbol(symbol: string): boolean {
    if (this.receivesAll) return true;
    return this.symbolSet.has(symbol.toUpperCase());
  }

  /** Whether this connection is subscribed to a named channel. */
  matchesChannel(channel: string): boolean {
    return this.channels.has(channel);
  }

  getSubscriptions(): ClientSubscription[] {
    return Array.from(this.subscriptions);
  }

  count(): number {
    return this.subscriptions.size;
  }

  private rebuildIndex(): void {
    this.symbolSet.clear();
    this.receivesAll = false;
    this.channels.clear();

    for (const sub of this.subscriptions) {
      switch (sub.kind) {
        case "symbol":
          for (const sym of normalizeSymbols(sub.symbols)) {
            this.symbolSet.add(sym);
          }
          break;
        case "watchlist":
          for (const sym of normalizeSymbols(sub.symbols)) {
            this.symbolSet.add(sym);
          }
          break;
        case "all":
          this.receivesAll = true;
          break;
        case "channel":
          this.channels.add(sub.channel);
          break;
      }
    }
  }
}
