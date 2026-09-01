/**
 * Entitlement layer — defines free vs. paid capability gates.
 *
 * V1: No billing integration. Tier is set via MAX_SYMBOLS env var + ENTITLEMENT_TIER.
 * Future: Swap EntitlementRepository.getTier() to call a billing backend.
 */

export type EntitlementTier = "free" | "paid";

export interface Entitlement {
  tier: EntitlementTier;
  /** Maximum number of symbols allowed in the scanner universe. */
  maxSymbols: number;
  /** Whether live data providers (Sierra, etc.) are permitted. Free = delayed/mock only. */
  liveDataEnabled: boolean;
}

export interface EntitlementViolation {
  code: "SYMBOL_LIMIT_EXCEEDED" | "LIVE_DATA_NOT_PERMITTED";
  message: string;
  limit?: number;
  current?: number;
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: "free",
  maxSymbols: 10,
  liveDataEnabled: false,
};

export const PAID_ENTITLEMENT: Entitlement = {
  tier: "paid",
  maxSymbols: 200,
  liveDataEnabled: true,
};
