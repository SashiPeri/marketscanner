import { Response } from "express";
import { MarketDataService } from "../services/MarketDataService";

export class MarketController {
  constructor(private readonly marketDataService: MarketDataService) {}

  getMarketData = (_req: unknown, res: Response): void => {
    res.json(this.marketDataService.getMarketData());
  };
}
