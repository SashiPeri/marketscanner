# Architecture

## Overview

Market Scanner is a single-process TypeScript monolith: Express HTTP server, WebSocket realtime layer, quantitative scanner engine, and React SPA. All market data flows through provider-agnostic normalized domain types.

## Subsystems

| Subsystem | Location | Responsibility |
|-----------|----------|----------------|
| Bootstrap | `server/index.ts` | Config validation, service wiring, HTTP listen |
| Configuration | `server/config/` | Environment parsing, defaults, fail-fast validation |
| Logging | `server/logging/` | Structured JSON logs with correlation IDs |
| Baseline Store | `server/baseline/` | ADR, ADV, ATR, intraday curves, session stats |
| Persistence | `server/persistence/` | Repository interfaces + memory/JSON backends |
| Scanner Engine | `server/scanner/` | Incremental metric pipeline and scoring |
| Event Bus | `server/events/` | In-process pub/sub between subsystems |
| Realtime | `server/realtime/` | WebSocket transport, batching, subscriptions |
| Providers | `server/providers/` | Mock and Sierra adapters behind `MarketProvider` |
| Health | `server/health/` | Liveness, readiness, and composite health |
| Metrics | `server/metrics/` | In-process counters and latency histograms |
| Lifecycle | `server/lifecycle/` | Graceful shutdown orchestration |

## Threading Model

Node.js single-threaded event loop. All subsystems run synchronously on the main thread:

- Scanner processing is synchronous per event
- EventBus publish never awaits subscribers
- BatchPublisher uses `setInterval` for 50ms coalescing
- WebSocket send uses non-blocking queue drain with backpressure

No worker threads or child processes in Phase 4D.

## Extension Points

1. **MarketProvider** — add new data sources without touching scanner math
2. **BaselineStore** — swap JSON for PostgreSQL/Redis via interface
3. **Persistence repositories** — swap memory/JSON for database backends
4. **Logger** — wrap JsonLogger for external log shipping
5. **MetricsService** — add Prometheus exposition format alongside JSON

## Dependency Graph

```
Config → Logger → BaselineStore + Persistence
              → ScannerEngine → ScannerEventBridge → EventBus
              → MarketProvider → ScannerEngine
              → MarketCacheService ← EventBus
              → RealtimeHub → RealtimeServer
              → HealthService + MetricsService
```

## Provider-Agnostic Contract

All scanner inputs are normalized types in `server/types/domain.ts`:

- `MarketSnapshot`
- `TradePrint`
- `OrderBookSnapshot`

Sierra DTC is one adapter; mock provider uses the same contracts.
