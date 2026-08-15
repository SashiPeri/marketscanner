import {
  RecordTradeRequest,
  TradeJournalEntry,
  TradeJournalQuery,
  TradeJournalSummary,
} from "./types";

export interface TradeJournalRepository {
  save(entry: TradeJournalEntry): void;
  get(id: string): TradeJournalEntry | undefined;
  list(query?: TradeJournalQuery): TradeJournalEntry[];
  delete(id: string): boolean;
  size(): number;
  flush(): Promise<{ flushed: number; durationMs: number }>;
}

export interface TradeJournalService {
  recordTrade(request: RecordTradeRequest): Promise<TradeJournalEntry>;
  getTrade(id: string): TradeJournalEntry | undefined;
  listTrades(query?: TradeJournalQuery): TradeJournalEntry[];
  deleteTrade(id: string): boolean;
  getSummary(query?: TradeJournalQuery): TradeJournalSummary;
  flush(): Promise<void>;
}
