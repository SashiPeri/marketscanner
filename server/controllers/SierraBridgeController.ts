import { Request, Response } from "express";
import { SierraBridgeService } from "../services/SierraBridgeService";
import { SierraSyncRequest } from "../types/market";

export class SierraBridgeController {
  constructor(private readonly sierraBridgeService: SierraBridgeService) {}

  sync = (req: Request<unknown, unknown, SierraSyncRequest>, res: Response): void => {
    const result = this.sierraBridgeService.sync(req.body);

    res.json({
      success: true,
      message: "Successfully synchronized with Sierra Chart instance.",
      sierraConfig: result.sierraConfig,
      markets: result.markets,
    });
  };

  disconnect = (_req: Request, res: Response): void => {
    res.json({
      success: true,
      sierraConfig: this.sierraBridgeService.disconnect(),
    });
  };
}
