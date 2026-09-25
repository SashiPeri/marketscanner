export interface MarketData {
  symbol: string;
  name: string;
  category: "FUTURES" | "FOREX" | "CRYPTO" | "EQUITIES";
  lastPrice: number;
  netChange: number;
  pctChange: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  rvol: number; // Relative Volume
  atr: number;  // Average True Range
  adrFilledPct: number; // ADR Exhaustion %
  vah: number;  // Value Area High
  val: number;  // Value Area Low
  poc: number;  // Point of Control
  regime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGE_BOUND" | "CHOPPY";
  probScore: number;
  grade: "A+" | "A" | "B" | "C" | "F";
  rationale: string;
}

export interface SierraConfig {
  localPort: number;
  connectionType: "HTTP_SERVER" | "DTC_PROTOCOL" | "FILE_SYNC" | "ACSIL_BRIDGE";
  status: "DISCONNECTED" | "CONNECTED" | "STANDBY";
  lastSyncTime: string | null;
  customSymbols: string[];
  symbolStates?: Record<string, { status: "PENDING" | "STREAMING" | "REJECTED" | "UNKNOWN_SYMBOL"; detail?: string }>;
}

export interface FocusAsset {
  symbol: string;
  strategy: string;
  rationale: string;
}

export interface AvoidAsset {
  symbol: string;
  reason: string;
}

export interface RegimeAlert {
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
}

export interface AIBriefing {
  dayOutlook: string;
  recommendedStrategy: string;
  focusList: FocusAsset[];
  avoidList: AvoidAsset[];
  regimeAlerts: RegimeAlert[];
  probabilityTips: string;
}
