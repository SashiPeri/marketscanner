import { InstrumentIdentity, MarketSnapshot, OrderBookSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { SymbolBaseline } from "./types";

export type ScannerMetricsRegime =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "RANGE_BOUND"
  | "CHOPPY"
  | "UNKNOWN";

/**
 * Per-symbol rolling state updated incrementally by the event pipeline.
 * All accumulators are O(1) per event; expensive derived values are amortized.
 */
export class SymbolState {
  readonly instrument: InstrumentIdentity;
  tickSize: number;

  lastSnapshot: MarketSnapshot | undefined;
  lastOrderBook: OrderBookSnapshot | undefined;

  sessionOpen: number | undefined;
  sessionHigh = -Infinity;
  sessionLow = Infinity;
  previousClose: number | undefined;
  sessionVolume = 0;

  vwapCumPV = 0;
  vwapCumV = 0;
  vwap = 0;
  prevPrice = 0;
  prevVwap = 0;
  vwapReclaim = false;
  vwapRejection = false;

  cumulativeDelta = 0;
  sessionDeltaHigh = -Infinity;
  sessionDeltaLow = Infinity;
  buyVolume = 0;
  sellVolume = 0;

  profileBuckets = new Map<number, number>();
  profileBuyBuckets = new Map<number, number>();
  profileSellBuckets = new Map<number, number>();
  poc = 0;
  pocVolume = 0;
  vah = 0;
  val = 0;
  profileTotalVolume = 0;
  tradesSinceVaRecalc = 0;

  atrPeriod = SCANNER_CONSTANTS.ATR_PERIOD;
  prevCloseForAtr = 0;
  atrSmoothed = 0;
  atrInitialized = false;
  currentAtr = 0;

  averageDailyRange = 0;
  adrFilledPercent = 0;

  averageSessionVolume = 0;
  relativeVolume = 1;
  /** Intraday volume curve from BaselineStore for time-of-day RVol normalization. */
  intradayVolumeCurve: number[] = [];

  openingRangeHigh: number | undefined;
  openingRangeLow: number | undefined;
  openingRangeSet = false;
  sessionStartMs: number | undefined;
  openingDrive: "UP" | "DOWN" | "FLAT" = "FLAT";

  bidAggression = 0;
  askAggression = 0;
  tradeImbalance = 0;
  bestBidSize = 0;
  bestAskSize = 0;

  recentPrices: number[] = [];
  recentVolumes: number[] = [];
  volumeMa = 0;

  regime: ScannerMetricsRegime = "UNKNOWN";
  subRegime: "TREND" | "BALANCE" | "ROTATION" | "BREAKOUT" | "UNKNOWN" = "UNKNOWN";
  trendStrength = 0;
  volatilityClass: "LOW" | "NORMAL" | "HIGH" | "EXTREME" = "NORMAL";

  eventCount = 0;
  lastCalculatedAt = new Date(0).toISOString();

  constructor(instrument: InstrumentIdentity, baseline?: SymbolBaseline) {
    this.instrument = instrument;
    this.tickSize = instrument.tickSize ?? SCANNER_CONSTANTS.DEFAULT_TICK_SIZE;

    if (baseline?.averageDailyRange) {
      this.averageDailyRange = baseline.averageDailyRange;
    }
    if (baseline?.averageSessionVolume) {
      this.averageSessionVolume = baseline.averageSessionVolume;
    }
    if (baseline?.intradayVolumeCurve && baseline.intradayVolumeCurve.length > 0) {
      this.intradayVolumeCurve = baseline.intradayVolumeCurve;
    }
    if (baseline?.averageTrueRange && baseline.averageTrueRange > 0) {
      this.atrSmoothed = baseline.averageTrueRange;
      this.currentAtr = baseline.averageTrueRange;
      this.atrInitialized = true;
    }
    if (baseline?.previousClose) {
      this.previousClose = baseline.previousClose;
      this.prevCloseForAtr = baseline.previousClose;
    }
  }

  /** Resolve or create state for a symbol, seeding baselines on first access. */
  static create(
    instrument: InstrumentIdentity,
    baselines: Map<string, SymbolBaseline>,
  ): SymbolState {
    const symbol = instrument.symbol.toUpperCase();
    const baseline = baselines.get(symbol);
    return new SymbolState(instrument, baseline);
  }

  /** Apply fallback estimates when provider data lacks historical baselines. */
  applyFallbackBaselines(price: number): void {
    if (this.averageDailyRange <= 0) {
      this.averageDailyRange = price * SCANNER_CONSTANTS.FALLBACK_ADR_PRICE_RATIO;
    }
    if (this.averageSessionVolume <= 0) {
      this.averageSessionVolume = Math.max(1, price * SCANNER_CONSTANTS.FALLBACK_AVG_VOLUME_RATIO * 1000);
    }
  }

  /** Price bucket key for volume profile histogram. */
  priceToBucket(price: number): number {
    const ts = this.tickSize;
    return Math.round(price / ts) * ts;
  }
}
