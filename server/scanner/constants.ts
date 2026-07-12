/** Centralized scanner tuning parameters — no magic numbers in calculation modules. */
export const SCANNER_CONSTANTS = {
  /** Lookback window for relative-volume baseline comparison. */
  RVOL_LOOKBACK_DAYS: 10,
  /** Period for average daily range baseline. */
  ADR_PERIOD: 14,
  /** Wilder ATR smoothing period. */
  ATR_PERIOD: 14,
  /** Fraction of total profile volume included in the value area. */
  VALUE_AREA_PERCENT: 0.7,
  /** Opening range window length in minutes (RTH-style). */
  OPENING_RANGE_MINUTES: 30,
  /** RVol above this threshold signals institutional participation. */
  HIGH_RVOL_THRESHOLD: 1.5,
  /** RVol below this threshold signals low-conviction chop. */
  LOW_RVOL_THRESHOLD: 0.8,
  /** Volume spike multiplier required to confirm a VWAP reclaim. */
  VWAP_RECLAIM_VOLUME_MULTIPLIER: 1.5,
  /** Rolling window for average trade volume (VWAP reclaim detection). */
  VOLUME_MA_PERIOD: 20,
  /** Default price bucket size when instrument tick size is unknown. */
  DEFAULT_TICK_SIZE: 0.01,
  /** Ring buffer length for short-term price trend detection. */
  PRICE_HISTORY_LENGTH: 20,
  /** ADR exhaustion threshold — above this favors mean-reversion signals. */
  ADR_EXHAUSTION_PERCENT: 100,
  /** ADR runway threshold — below this favors breakout continuation. */
  ADR_RUNWAY_PERCENT: 60,
  /** Minimum price observations before regime classification activates. */
  MIN_REGIME_SAMPLES: 5,
  /** Recalculate value area every N trade updates (amortized cost). */
  VALUE_AREA_RECALC_INTERVAL: 10,
  /** Fallback ADR as fraction of price when no historical baseline exists. */
  FALLBACK_ADR_PRICE_RATIO: 0.015,
  /** Fallback average session volume as fraction of a typical baseline. */
  FALLBACK_AVG_VOLUME_RATIO: 0.5,
  /** Grade score thresholds. */
  GRADE_THRESHOLDS: {
    A_PLUS: 90,
    A: 80,
    B: 65,
    C: 50,
  } as const,
  /** Scoring weight distribution (must sum to 1.0). */
  SCORE_WEIGHTS: {
    RELATIVE_VOLUME: 0.2,
    TREND_ALIGNMENT: 0.2,
    ADR_POSITION: 0.15,
    VWAP_POSITION: 0.15,
    DELTA_CONFIRMATION: 0.15,
    REGIME_QUALITY: 0.15,
  } as const,
} as const;
