import { ServerConfig } from "../config";
import {
  Entitlement,
  EntitlementTier,
  EntitlementViolation,
  FREE_ENTITLEMENT,
  PAID_ENTITLEMENT,
} from "./types";

/**
 * EntitlementService — enforces symbol limits and feature gates.
 *
 * V1: tier resolved from env vars only.
 * Future: inject a TierRepository that calls a billing backend.
 */
export class EntitlementService {
  private readonly entitlement: Entitlement;

  constructor(config: ServerConfig) {
    const raw = (process.env.ENTITLEMENT_TIER ?? "free").toLowerCase() as EntitlementTier;
    const base = raw === "paid" ? { ...PAID_ENTITLEMENT } : { ...FREE_ENTITLEMENT };

    // MAX_SYMBOLS env var overrides default tier limits (useful for self-hosted paid users)
    if (config.maxSymbols !== undefined) {
      base.maxSymbols = config.maxSymbols;
    }
    this.entitlement = base;
  }

  getEntitlement(): Entitlement {
    return this.entitlement;
  }

  getTier(): EntitlementTier {
    return this.entitlement.tier;
  }

  /**
   * Check if adding `count` more symbols would violate the symbol limit.
   * Pass the current count of tracked symbols.
   */
  checkSymbolLimit(currentCount: number): EntitlementViolation | null {
    if (currentCount >= this.entitlement.maxSymbols) {
      return {
        code: "SYMBOL_LIMIT_EXCEEDED",
        message: `Symbol limit reached. ${this.entitlement.tier === "free" ? "Upgrade to paid tier" : "Increase MAX_SYMBOLS"} to track more symbols.`,
        limit: this.entitlement.maxSymbols,
        current: currentCount,
      };
    }
    return null;
  }

  /**
   * Check whether a live data provider is permitted under the current tier.
   */
  checkLiveDataPermission(): EntitlementViolation | null {
    if (!this.entitlement.liveDataEnabled) {
      return {
        code: "LIVE_DATA_NOT_PERMITTED",
        message:
          "Live data requires a paid tier. Running in mock/delayed mode. Set ENTITLEMENT_TIER=paid to enable Sierra Chart or other live providers.",
      };
    }
    return null;
  }

  isPaid(): boolean {
    return this.entitlement.tier === "paid";
  }

  isFree(): boolean {
    return this.entitlement.tier === "free";
  }
}
