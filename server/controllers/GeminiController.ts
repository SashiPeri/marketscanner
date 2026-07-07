import { Request, Response } from "express";
import { GeminiService } from "../gemini/GeminiService";
import { MarketProvider } from "../providers/MarketProvider";
import { MarketData } from "../types/market";

interface GeminiAnalyzeRequest {
  markets?: MarketData[];
}

export class GeminiController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly marketProvider: MarketProvider,
  ) {}

  analyze = async (req: Request<unknown, unknown, GeminiAnalyzeRequest>, res: Response): Promise<void> => {
    try {
      const targetMarkets = req.body.markets && Array.isArray(req.body.markets)
        ? req.body.markets
        : this.marketProvider.getMarkets();

      res.json(await this.geminiService.analyze(targetMarkets));
    } catch (error: any) {
      console.error("Gemini analysis error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to analyze markets using Gemini.",
      });
    }
  };
}
