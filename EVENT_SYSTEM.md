# Event System

## EventBus

Location: `server/events/EventBus.ts`

In-process synchronous pub/sub. Channels defined in `server/events/types.ts`:

| Channel | Payload | Producers | Consumers |
|---------|---------|-----------|-----------|
| `scanner:result` | `ScoredScannerResult` | ScannerEventBridge | MarketCache, RealtimeHub |
| `scanner:signal` | `ScannerSignal` | (reserved) | Future alert routing |
| `connection:status` | `ConnectionStatus` | (reserved) | Future UI status |

### Concurrency Guarantees

- `publish()` is synchronous — never awaits handlers
- Handler exceptions are caught and logged — never propagate to producers
- Slow consumers cannot block the ScannerEngine

## ScannerEventBridge

Decouples `ScannerEngine.onResult()` from the EventBus:

1. Receives `ScoredScannerResult`
2. Publishes to `scanner:result`
3. Persists snapshot and signals
4. Records scanner latency metrics

Returns an unsubscribe function stored for graceful shutdown.

## Realtime Pipeline

### RealtimeHub

Subscribes to `scanner:result`:

1. Maps to `MarketData` via `mapScannerResultToMarketData()`
2. Enqueues in `BatchPublisher`
3. On flush, fans out filtered batches to WebSocket connections

### BatchPublisher

- Fixed interval (default 50ms, configurable via `BATCH_INTERVAL_MS`)
- Per-symbol coalescing: latest update wins
- O(1) enqueue, timer-driven flush

### SubscriptionManager

Per-connection subscription index:

- `all` — receive every symbol (default on connect)
- `symbol` — explicit symbol list
- `watchlist` — named watchlist
- `channel` — reserved for future channel routing

### ConnectionManager

Bounded outbound queue (max 8 batches). Drops oldest on overflow. `send()` never blocks producers.

## WebSocket Protocol

Unchanged from Phase 4C:

**Client → Server:** `ping`, `subscribe`, `unsubscribe`

**Server → Client:** `connected`, `batch`, `pong`, `error`

Path: `/ws`

## Backpressure Isolation

```
ScannerEngine (sync)
    → EventBus (sync, isolated errors)
        → BatchPublisher (coalesce)
            → ConnectionManager (bounded queue, drop oldest)
```

The scanner and event bus never wait on WebSocket I/O.
