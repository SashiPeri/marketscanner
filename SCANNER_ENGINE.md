# Scanner Engine

## Purpose

The Scanner Engine (`server/scanner/ScannerEngine.ts`) is a provider-agnostic orchestrator that consumes normalized market events and produces `ScoredScannerResult` outputs.

## Inputs

| Event | Source | Modules Updated |
|-------|--------|-----------------|
| `MarketSnapshot` | Provider adapter | Session, RVol, ADR, ATR, VWAP |
| `TradePrint` | Provider adapter | VWAP, Delta, Volume Profile |
| `OrderBookSnapshot` | Provider adapter | Order Flow |

## Baseline Integration (Phase 4D)

ScannerEngine depends on `BaselineStore` instead of price-ratio placeholders:

- **ADR** — `adr14Day` from store → `SymbolState.averageDailyRange`
- **RVol** — `averageDailyVolume` + `intradayVolumeCurve` for time-of-day normalization
- **ATR** — `atr20Day` seeds Wilder smoothing on first event

Fallback ratios (`FALLBACK_ADR_PRICE_RATIO`, `FALLBACK_AVG_VOLUME_RATIO`) remain as last resort when a symbol has no stored baseline.

## Pipeline Architecture

```
ScannerEngine
    └── EventPipeline
            ├── SymbolState (per symbol, O(1) accumulators)
            ├── ADR.ts, ATR.ts, RelativeVolume.ts
            ├── VWAP.ts, Delta.ts, VolumeProfile.ts
            ├── OrderFlow.ts, SessionMetrics.ts
            ├── Regime.ts, Signals.ts, Scoring.ts
            └── finalize() → ScoredScannerResult
```

## Incremental Design

- Per-symbol `SymbolState` created lazily on first event
- Volume profile VAH/VAL recalculated every N trades (amortized)
- Ring buffers for price/volume history
- No full-history replay on each tick

## Output Contract

`ScoredScannerResult` extends `ScannerResult` with:

- `metrics` — full scanner metric bundle
- `signals` — rule-generated trade setups
- `score` / `grade` / `rationale` — composite scoring

Downstream consumers:

- `ScannerEventBridge` → EventBus
- `mapScannerResultToMarketData()` → REST/WebSocket `MarketData`

## Lifecycle

- `initialize()` — load baselines from store
- `onResult(listener)` — register downstream callback (returns unsubscribe)
- `stop()` — halt processing and clear listeners

## Math Stability

Phase 4D does not modify scanner math modules. Only baseline sourcing changed from placeholders to `BaselineStore`.
