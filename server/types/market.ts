export interface SierraConfig {
  localPort: number;
  connectionType: "HTTP_SERVER" | "DTC_PROTOCOL" | "FILE_SYNC";
  status: "DISCONNECTED" | "CONNECTED" | "STANDBY";
  lastSyncTime: string | null;
  customSymbols: string[];
}

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
  rvol: number;
  atr: number;
  adrFilledPct: number;
  vah: number;
  val: number;
  poc: number;
  regime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGE_BOUND" | "CHOPPY";
  probScore: number;
  grade: "A+" | "A" | "B" | "C" | "F";
  rationale: string;
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

export interface MarketDataResponse {
  timestamp: string;
  markets: MarketData[];
  sierraConfig: SierraConfig;
}

export interface SierraSyncRequest {
  localPort?: number;
  connectionType?: SierraConfig["connectionType"];
  customSymbols?: string[];
}
