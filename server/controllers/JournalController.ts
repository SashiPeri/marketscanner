import { Request, Response } from "express";
import { TradeJournalService } from "../journal/TradeJournalRepository";
import { RecordTradeRequest, TradeJournalQuery } from "../journal/types";

export class JournalController {
  constructor(private readonly journalService: TradeJournalService) {}

  recordTrade = async (
    req: Request<unknown, unknown, RecordTradeRequest>,
    res: Response,
  ): Promise<void> => {
    const body = req.body;

    if (!body.symbol || !body.side || body.entry == null || body.exit == null || body.size == null) {
      res.status(400).json({ success: false, error: "Missing required fields: symbol, side, entry, exit, size" });
      return;
    }

    if (!["LONG", "SHORT"].includes(body.side)) {
      res.status(400).json({ success: false, error: "side must be LONG or SHORT" });
      return;
    }

    const entry = await this.journalService.recordTrade(body);
    res.status(201).json({ success: true, entry });
  };

  getTrade = (req: Request<{ id: string }>, res: Response): void => {
    const entry = this.journalService.getTrade(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, error: "Trade not found" });
      return;
    }
    res.json({ success: true, entry });
  };

  listTrades = (req: Request, res: Response): void => {
    const query: TradeJournalQuery = {
      symbol: req.query.symbol as string | undefined,
      side: req.query.side as "LONG" | "SHORT" | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };

    const entries = this.journalService.listTrades(query);
    res.json({ success: true, entries, count: entries.length });
  };

  deleteTrade = (req: Request<{ id: string }>, res: Response): void => {
    const deleted = this.journalService.deleteTrade(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Trade not found" });
      return;
    }
    res.json({ success: true });
  };

  getSummary = (req: Request, res: Response): void => {
    const query: TradeJournalQuery = {
      symbol: req.query.symbol as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };

    const summary = this.journalService.getSummary(query);
    res.json({ success: true, summary });
  };
}
