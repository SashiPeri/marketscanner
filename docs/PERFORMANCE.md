# Performance Optimizations (Phase 4D)

Documented hot-path improvements. Scanner math formulas are unchanged.

## BatchPublisher

- **Reuse flush buffer** — `flushBuffer` is cleared via `.length = 0` and refilled instead of `Array.from(pending.values())` each tick.
- Avoids one array allocation per 50ms flush window.

## RealtimeHub

- **Reuse filter buffer** — per-connection subscription filtering writes into a shared `filterBuffer` instead of `updates.filter()`.
- Slice only when a client has matching symbols (outbound message needs its own array).

## EventPipeline / BaselineStore

- **Single-symbol baseline resolve** — `baselineResolver(symbol)` looks up one key from BaselineStore instead of rebuilding a full `Map` on every event.
- Baselines remain in the pipeline map after seed; resolver only refreshes when needed.

## Persistence

- **Deferred durable flush** — JSON repositories write to disk on `flush()` (shutdown), not per tick. Hot path is in-memory Map only.

## ConnectionManager

- Existing bounded outbound queue (max 8) — drop oldest under backpressure; no change to protocol.
- Avoids unbounded memory growth under slow clients.

## MetricsService

- Fixed-size latency sample rings (`maxSamples = 1000`) with `shift()` eviction — bounded memory for p50/p95.

## Logging

- Structured JSON lines; no third-party logger allocations beyond `JSON.stringify` of a flat context object.
