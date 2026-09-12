import { Request, Response } from "express";
import { EntitlementService } from "../entitlement";
import { ConditionEvaluator, ConditionSet, StudyValueStore } from "../scanner";
import { StudyValueSnapshot } from "../types";
import { ScannerConfig } from "../scanner/ScannerConfig";
import { ScannerConfigRepository } from "../scanner/ScannerConfigRepository";
import { ConditionSetRepository } from "../scanner/ConditionSetRepository";
import { ScannerEngine } from "../scanner/ScannerEngine";
import { WatchlistRepository, WatchlistSymbol } from "../scanner/WatchlistRepository";
import { INDICATOR_REGISTRY } from "../scanner/ScannerConfig";

export class ScannerConfigController {
  constructor(
    private readonly configRepo: ScannerConfigRepository,
    private readonly watchlist: WatchlistRepository,
    private readonly entitlement: EntitlementService,
    private readonly conditionSetRepo: ConditionSetRepository,
    private readonly scannerEngine: ScannerEngine,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly studyValueStore: StudyValueStore,
  ) {}

  getConfig = (_req: Request, res: Response): void => {
    const config = this.configRepo.get();
    const ent = this.entitlement.getEntitlement();
    res.json({
      success: true,
      config,
      entitlement: ent,
      indicatorRegistry: INDICATOR_REGISTRY,
      conditionSets: this.conditionSetRepo.getAll(),
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

  getConditionSets = (_req: Request, res: Response): void => {
    res.json({
      success: true,
      conditionSets: this.conditionSetRepo.getAll(),
    });
  };

  replaceConditionSets = (
    req: Request<unknown, unknown, { conditionSets: ConditionSet[] }>,
    res: Response,
  ): void => {
    const { conditionSets } = req.body;

    if (!Array.isArray(conditionSets)) {
      res.status(400).json({ success: false, error: "conditionSets array is required" });
      return;
    }

    res.json({
      success: true,
      conditionSets: this.conditionSetRepo.replaceAll(conditionSets),
    });
  };

  getConditionMatches = (_req: Request, res: Response): void => {
    const enabledConditionSets = this.conditionSetRepo.getAll().filter((set) => set.enabled);
    const results = this.scannerEngine.getAllResults();
    const matches = enabledConditionSets.flatMap((conditionSet) =>
      results.map((result) => this.conditionEvaluator.evaluate(conditionSet, result)),
    );

    res.json({
      success: true,
      evaluatedSymbols: results.length,
      conditionSets: enabledConditionSets.length,
      matches: matches.filter((match) => match.matched),
      evaluations: matches,
    });
  };

  upsertStudyValues = (
    req: Request<unknown, unknown, StudyValueSnapshot>,
    res: Response,
  ): void => {
    const snapshot = req.body;

    if (!snapshot?.instrument?.symbol || !Array.isArray(snapshot.values)) {
      res.status(400).json({
        success: false,
        error: "instrument.symbol and values array are required",
      });
      return;
    }

    const normalized: StudyValueSnapshot = {
      ...snapshot,
      instrument: {
        ...snapshot.instrument,
        symbol: snapshot.instrument.symbol.toUpperCase(),
      },
      receivedAt: snapshot.receivedAt || new Date().toISOString(),
      values: snapshot.values.map((value) => ({
        ...value,
        receivedAt: value.receivedAt || new Date().toISOString(),
      })),
    };

    this.studyValueStore.set(normalized);
    res.json({ success: true, snapshot: normalized });
  };

  getStudyValues = (_req: Request, res: Response): void => {
    res.json({
      success: true,
      count: this.studyValueStore.size(),
      snapshots: this.studyValueStore.getAll(),
    });
  };
}
