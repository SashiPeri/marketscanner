# Data Flow

## Startup Data Flow

1. `loadConfig()` validates environment variables
2. `createBaselineStore()` seeds from `initialMarkets` (no external fetch)
3. `ScannerEngine.initialize()` loads baselines from store
4. `MarketProvider.start()` seeds scanner with initial snapshots
5. `ScannerEventBridge` publishes results to EventBus
6. `MarketCacheService` and `RealtimeHub` subscribe to `scanner:result`
7. WebSocket clients receive batched `MarketData` updates

## Realtime Event Flow

```
Provider (Mock / Sierra)
    │ MarketSnapshot, TradePrint, OrderBookSnapshot
    ▼
ScannerEngine
    │ ScoredScannerResult
    ▼
ScannerEventBridge
    │ scanner:result
    ├──────────────────┬─────────────────────┐
    ▼                  ▼                     ▼
MarketCacheService  RealtimeHub         Persistence repos
    │                  │
    │                  ▼
    │             BatchPublisher (50ms)
    │                  │
    │                  ▼
    │          SubscriptionManager filter
    │                  │
    ▼                  ▼
REST /api/market-data  WebSocket /ws batch messages
```

## Baseline Data Flow

```
initialMarkets (seed)
    ▼
BaselineStore.set() / load()
    ▼
ScannerEngine → EventPipeline → SymbolState
    │                              │
    │                              ├─ ADR: adr14Day baseline
    │                              ├─ RVol: ADV + intraday curve
    │                              └─ ATR: atr20Day seed
    ▼
Session end → BaselineStore.refresh() → save()
```

`refresh()` updates rolling averages from accumulated session statistics. No external API calls.

## Persistence Flow

On each scanner result:

- `MarketSnapshotRepository.save(snapshot)`
- `ScannerSignalRepository.save(signal)` per active signal

On shutdown:

- `BaselineStore.save()`
- All repositories `flush()` to JSON files (when `PERSISTENCE_MODE=json`)

## REST Fallback Flow

Frontend `useMarketSocket` connects to `/ws`. On disconnect, polls `GET /api/market-data` which reads `MarketCacheService` — same data path as WebSocket, no duplicate cache.
