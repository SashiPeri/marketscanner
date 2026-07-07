import { MarketProvider } from "../providers/MarketProvider";
import { SierraSyncRequest } from "../types/market";

export class SierraBridgeService {
  constructor(private readonly marketProvider: MarketProvider) {}

  sync(params: SierraSyncRequest) {
    return this.marketProvider.syncSierra(params);
  }

  disconnect() {
    return this.marketProvider.disconnectSierra();
  }
}
