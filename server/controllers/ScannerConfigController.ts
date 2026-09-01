import { Request, Response } from "express";
import { EntitlementService } from "../entitlement";
import { ScannerConfig } from "../scanner/ScannerConfig";
import { ScannerConfigRepository } from "../scanner/ScannerConfigRepository";
import { WatchlistRepository, WatchlistSymbol } from "../scanner/WatchlistRepository";
import { INDICATOR_REGISTRY } from "../scanner/ScannerConfig";

export class ScannerConfigController {
  constructor(
    private readonly configRepo: ScannerConfigRepository,
    private readonly watchlist: WatchlistRepository,
    private readonly entitlement: EntitlementService,
  ) {}

  getConfig = (_req: Request, res: Response): void => {
    const config = this.configRepo.get();
    const ent = this.entitlement.getEntitlement();
    res.json({
      success: true,
      config,
      entitlement: ent,
      indicatorRegistry: INDICATOR_REGISTRY,
    });
  };

  updateConfig = (
    req: Request<unknown, unknown, Partial<Omit<ScannerConfig, "version" | "updatedAt">>>,
    res: Response,
  ): void => {
    const updated = this.configRepo.patch(req.body);
    res.json({ success: true, config: updated });
  };

  // ─── Watchlist ───────────────────────────────────────────────────────────

  getWatchlist = (_req: Request, res: Response): void => {
    const symbols = this.watchlist.getAll();
    const ent = this.entitlement.getEntitlement();
    res.json({
      success: true,
      symbols,
      count: symbols.length,
      limit: ent.maxSymbols,
      tier: ent.tier,
    });
  };

  addSymbol = (
    req: Request<unknown, unknown, { symbol: string; name?: string; category?: WatchlistSymbol["category"] }>,
    res: Response,
  ): void => {
    const { symbol, name, category } = req.body;

    if (!symbol || typeof symbol !== "string") {
      res.status(400).json({ success: false, error: "symbol is required" });
      return;
    }

    const violation = this.entitlement.checkSymbolLimit(this.watchlist.size());
    if (violation) {
      res.status(403).json({ success: false, error: violation.message, violation });
      return;
    }

    this.watchlist.add({
      symbol: symbol.toUpperCase(),
      name,
      category,
      addedAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      symbols: this.watchlist.getAll(),
      count: this.watchlist.size(),
    });
  };

  removeSymbol = (req: Request<{ symbol: string }>, res: Response): void => {
    const removed = this.watchlist.remove(req.params.symbol);
    if (!removed) {
      res.status(404).json({ success: false, error: `Symbol not found: ${req.params.symbol}` });
      return;
    }
    res.json({ success: true, symbols: this.watchlist.getAll() });
  };

  bulkAddSymbols = (
    req: Request<unknown, unknown, { symbols: string[] }>,
    res: Response,
  ): void => {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({ success: false, error: "symbols array is required" });
      return;
    }

    const ent = this.entitlement.getEntitlement();
    const currentCount = this.watchlist.size();
    const newSymbols = symbols.filter((s) => !this.watchlist.has(s));

    if (currentCount + newSymbols.length > ent.maxSymbols) {
      const allowed = Math.max(0, ent.maxSymbols - currentCount);
      res.status(403).json({
        success: false,
        error: `Adding all ${newSymbols.length} symbols would exceed the ${ent.maxSymbols}-symbol limit. Only ${allowed} slots remaining.`,
        violation: {
          code: "SYMBOL_LIMIT_EXCEEDED",
          limit: ent.maxSymbols,
          current: currentCount,
          requested: newSymbols.length,
          allowed,
        },
      });
      return;
    }

    const entries: WatchlistSymbol[] = newSymbols.map((s) => ({
      symbol: s.toUpperCase(),
      addedAt: new Date().toISOString(),
    }));

    this.watchlist.addMany(entries);

    res.json({
      success: true,
      added: newSymbols.length,
      symbols: this.watchlist.getAll(),
      count: this.watchlist.size(),
    });
  };

  getEntitlement = (_req: Request, res: Response): void => {
    res.json({ success: true, entitlement: this.entitlement.getEntitlement() });
  };
}
