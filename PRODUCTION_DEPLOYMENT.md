# Production Deployment

## Prerequisites

- Node.js 22+
- npm
- Optional: Sierra Chart with DTC server (port 11099)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `testing` |
| `PORT` | `3000` | HTTP + WebSocket port |
| `MARKET_PROVIDER` | `mock` | `mock` or `sierra` |
| `PERSISTENCE_MODE` | `json` | `json` or `memory` |
| `DATA_DIR` | `data` | Persistence file directory |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `BATCH_INTERVAL_MS` | `50` | WebSocket batch coalesce interval |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |
| `APP_VERSION` | `0.0.0` | Reported in health endpoints |
| `BUILD_TIMESTAMP` | auto | ISO build timestamp for health |

See `.env.example` for Sierra DTC settings.

## Build & Run

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

## Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Composite status: websocket, scanner, Sierra, memory, queues |
| `GET /health/live` | Process liveness (always 200 if running) |
| `GET /health/ready` | Readiness checks (503 if not ready) |

## Metrics Endpoint

`GET /metrics` — JSON snapshot of ticks/sec, latencies, memory, CPU, subscriptions, cache size.

Prometheus format planned for a future phase.

## Startup Sequence

1. Load and validate config (fail fast on invalid values)
2. Create structured logger with correlation ID
3. Load BaselineStore from JSON (or seed in memory)
4. Initialize ScannerEngine with baselines
5. Wire EventBus, persistence, market provider
6. Start realtime hub and attach WebSocket to HTTP server
7. Register graceful shutdown handlers
8. Listen on configured port

## Shutdown Sequence

Triggered by `SIGINT`, `SIGTERM`, unhandled rejection, or uncaught exception:

1. Close WebSocket server
2. Stop RealtimeHub (batch timer, connections)
3. Unsubscribe EventBus listeners (scanner bridge, cache)
4. Stop market provider (disconnect Sierra / clear mock interval)
5. Stop ScannerEngine
6. Refresh and save BaselineStore
7. Flush all persistence repositories
8. Close HTTP server
9. Exit process

Timeout: `SHUTDOWN_TIMEOUT_MS` (force exit on breach).

## Data Directory

When `PERSISTENCE_MODE=json`, the following files are written to `DATA_DIR/`:

- `baselines.json`
- `snapshots.json`
- `trades.json`
- `signals.json`
- `sessions.json`

Mount `DATA_DIR` as a persistent volume in container deployments.

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `MARKET_PROVIDER=sierra` with valid DTC credentials
- [ ] Set `PERSISTENCE_MODE=json` with persistent volume
- [ ] Configure `LOG_LEVEL=info` or `warn`
- [ ] Set `BUILD_TIMESTAMP` at CI build time
- [ ] Wire load balancer health checks to `/health/ready`
- [ ] Monitor `/metrics` for latency and throughput

## Remaining Before Phase 4E

- PostgreSQL/Redis persistence backends
- Prometheus `/metrics` exposition format
- External log shipping (Datadog, CloudWatch)
- Horizontal scaling with shared state store
- Rate limiting and API authentication
