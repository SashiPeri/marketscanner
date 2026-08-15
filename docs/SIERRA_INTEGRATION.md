# Sierra Integration Layer

Architecture for reading Sierra Chart market tape, historical ticks, replay metadata, chartbooks, executions, and fills — and correlating fills with scanner state.

This layer is **abstractions only**. Concrete DTC/ACSIL/file parsers are future work. The existing live DTC path (`server/providers/sierra/`) is **not** modified and remains the realtime `MarketProvider` adapter.

**Code:** `server/sierra-integration/`

---

## Goals

| # | Goal | Status |
|---|------|--------|
| 1 | Read completed trades (market tape) | Interface defined |
| 2 | Read historical tick data | Interface defined |
| 3 | Read replay sessions | Interface defined (observe-only) |
| 4 | Read chartbook information | Interface defined |
| 5 | Import executions | Interface defined |
| 6 | Import fills | Interface defined |
| 7 | Correlate fills with scanner state | Interface defined |

**Out of scope:** AI, backtesting, order submission, DTC codec changes.

---

## Sierra Interface Inventory

### 1. DTC (Data and Trading Communications)

**What it is.** External TCP protocol (binary or JSON) exposed by Sierra Chart’s DTC Server. This application already uses DTC for live L1 snapshots, trade prints, and DOM via `SierraDtcProvider`.

**Strengths**

- Low-latency live tape and depth
- Historical Price Data request/response messages for remote Node clients
- Order/fill streaming when Sierra is connected as a trading server
- Fits the existing provider-agnostic `TradePrint` / `MarketSnapshot` pipeline

**Limits**

- Does not expose chartbook layout or study configuration
- Replay clock control is weak from outside Sierra
- Multi-session fill/order history is less complete than the Trade Activity Log
- Historical tick throughput depends on SC settings and request batching

**Best for:** live completed trades; remote historical tick requests; realtime fill stream when trade-connected.

### 2. ACSIL (Advanced Custom Study Interface and Language)

**What it is.** In-process C++ study API inside Sierra Chart (`sc.*`). Studies run on Sierra’s chart update thread with direct access to bars, ticks, depth, and trading helpers such as `sc.GetOrderFillEntry` / trade list APIs.

**Strengths**

- Fastest access to Sierra-internal buffers
- Natural place to observe **Replay** (same study runs on replayed data)
- Can enumerate chart context and push metadata out via custom IPC (UDP/TCP/shared memory)
- Fill/order helpers for the current trading day inside SC

**Limits**

- Requires a compiled DLL; not callable directly from Node
- Bugs can destabilize the Sierra process
- Needs a bridge (socket/file) to reach this scanner process

**Best for:** replay session observation; chartbook/chart metadata; in-SC historical arrays when a bridge DLL exists.

### 3. Trade Activity Log (TAL)

**What it is.** Sierra’s authoritative trade journal (`Trade >> Trade Activity Log`), persisted under `TradeActivityLogs/`, with File → Export / Import (tab-delimited text into `SavedTradeActivity/`).

**Strengths**

- System of record for fills, orders, and related activity across sessions
- Export/import supports offline ingestion into external tools
- Millisecond fill timestamps suitable for correlation windows

**Limits**

- File/export oriented — not a sub-millisecond streaming API
- Custom/text formats require a dedicated parser adapter
- Display depends on Symbol Settings (tick size, value format)

**Best for:** importing executions and fills; offline reconciliation; multi-day history.

### 4. Historical Files

**What it is.** Sierra data folder artifacts: intraday data files, market depth files, CSV/text exports, and datasets used by Replay.

**Strengths**

- Bulk offline ticks/bars without keeping DTC connected
- Natural input to Sierra Replay
- Useful for building baseline stores later

**Limits**

- Native binary formats are proprietary; prefer SC export or ACSIL over reverse-engineering
- No live updates; batch load only

**Best for:** offline historical tick backfill; replay data packages.

---

## Task → Recommended Interface

| Goal | Primary | Secondary | Rationale |
|------|---------|-----------|-----------|
| Completed market trades | **DTC** live TradeUpdate | Historical files / ACSIL backfill | Already in stack; lowest latency into ScannerEngine |
| Historical tick data | **DTC** Historical Price Data **or** exported tick files | ACSIL bar/tick arrays via bridge | DTC for remote Node; files for bulk offline |
| Replay sessions | **ACSIL** + SC Replay | Historical files feeding Replay | Replay clock lives in Sierra; Node observes, does not drive SC |
| Chartbook information | **ACSIL** / chartbook metadata bridge | Manual export | Chartbooks are SC-internal; DTC does not expose layout |
| Import executions | **Trade Activity Log** | ACSIL order APIs (live day) | TAL is system of record |
| Import fills | **Trade Activity Log** (Fills) | DTC fill messages (realtime) | TAL for history; DTC for live stream |
| Correlate fills ↔ scanner | **App-side `FillScannerCorrelator`** | — | Join symbol + time window (+ optional ids) against ScannerEngine / persistence |

Encoded in code: `server/sierra-integration/capabilities.ts`.

---

## Layer Architecture

```
Sierra Chart
  ├── DTC Server ──────────────► (future) Dtc* adapters
  ├── ACSIL DLL + IPC ─────────► (future) AcsilBridge adapters
  ├── Trade Activity Log ──────► (future) TalFile adapters
  └── Historical files ────────► (future) HistoricalFile adapters
           │
           ▼
server/sierra-integration/          ◄── abstractions (this phase)
  ├── SierraTradeTapeSource
  ├── SierraHistoricalTickSource
  ├── SierraReplaySessionSource
  ├── SierraChartbookSource
  ├── SierraExecutionSource
  ├── SierraFillSource
  ├── FillScannerCorrelator
  └── SierraIntegrationFacade
           │
           ▼
ScannerEngine / Persistence         ◄── correlation target (existing)
```

Live market data continues through:

`SierraMarketProviderAdapter` → `ScannerEngine` → EventBus → cache / WebSocket

The integration layer sits **beside** that path for history, account activity, and fill correlation.

---

## Abstraction Contracts

All sources are async and read-oriented (no order submission).

| Interface | Key methods |
|-----------|-------------|
| `SierraTradeTapeSource` | `subscribeCompletedTrades`, `getCompletedTrades` |
| `SierraHistoricalTickSource` | `fetchTicks` (async iterable) |
| `SierraReplaySessionSource` | `listSessions`, `getStatus` (observe-only) |
| `SierraChartbookSource` | `listChartbooks`, `getChartbook` |
| `SierraExecutionSource` | `importExecutions`, `listExecutions` |
| `SierraFillSource` | `importFills`, `listFills`, `subscribeFills` |
| `FillScannerCorrelator` | `correlate`, `correlateBatch` |

Normalized records (`CompletedTrade`, `FillRecord`, `ExecutionRecord`, …) live in `types.ts` and use `InstrumentIdentity` from `server/types/domain.ts` where applicable.

`createUnimplementedSierraIntegration()` returns stubs: **list/get** return empty; **import/subscribe/fetch** throw `SierraIntegrationNotImplementedError` with `transport` + `goal`.

---

## Fill ↔ Scanner Correlation

Correlation is application-side (not a Sierra protocol):

1. Resolve fill `symbol` → canonical instrument.
2. Find scanner state at fill time: live `ScannerEngine.getResult(symbol)` and/or persisted snapshots near `fill.providerTimestamp`.
3. Match method: exact trade id (rare), else time-window ± N ms, else nearest snapshot.
4. Emit `FillScannerCorrelation` with confidence and copied scanner fields (score, grade, RVol, regime, …) for later analytics — **not** backtesting.

---

## Extension Points (future adapters)

Implement adapters in separate modules; inject into `SierraIntegrationFacade`. Do **not** modify DTC codec under `server/providers/sierra/`.

| Adapter | Transport | Responsibility |
|---------|-----------|----------------|
| `DtcTradeTapeAdapter` | DTC | Map live/historical trade updates → `CompletedTrade` |
| `DtcHistoricalTickAdapter` | DTC | Historical Price Data → `HistoricalTick` stream |
| `TradeActivityLogFileAdapter` | TAL | Parse export → executions/fills |
| `AcsilBridgeAdapter` | ACSIL IPC | Replay status, chartbook metadata, optional ticks |
| `HistoricalFileTickAdapter` | Files | Offline tick pages from exports |
| `FillScannerCorrelatorImpl` | App | Time-window join vs ScannerEngine / repos |

---

## Wiring Policy

The facade is **not** registered in `createServices` until a concrete adapter exists. Import from `server/sierra-integration` when building adapters or tests.

---

## Related Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — system overview
- [docs/SIERRA_ARCHITECTURE.md](./SIERRA_ARCHITECTURE.md) — earlier DTC/realtime design notes
- [DATA_FLOW.md](../DATA_FLOW.md) — live scanner event flow
