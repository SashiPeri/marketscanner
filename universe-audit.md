# End-to-End Audit: Scanner Config / Universe / Watchlist / Sierra / Entitlement

Generated: Mon Sep 14 2026

---

## 1. Where each value originates

| Value | Originates at |
|---|---|
| `ScannerConfig.universe` | `DEFAULT_SCANNER_CONFIG.universe: []` (`server/scanner/ScannerConfig.ts:58`). Only mutation path is `PUT /api/scanner/config` → `ScannerConfigController.updateConfig:26-32` → `ScannerConfigRepository.patch:65-74`. **No UI component ever sets it.** |
| Watchlist symbols | User input → `ScannerGrid` add-symbol flow → `useScannerConfig.addSymbol` (`src/hooks/useScannerConfig.ts:138-161`) → `POST /api/scanner/watchlist/symbols` → `ScannerConfigController.addSymbol:48-77` (also `bulkAddSymbols:88-132`). |
| Entitlement limits | `ENTITLEMENT_TIER` env (default `free`) + `MAX_SYMBOLS` override → `EntitlementService` constructor (`server/entitlement/EntitlementService.ts:19-28`). Tiers: FREE=10, PAID=200 (`server/entitlement/types.ts:25-35`). Env parsed at `server/config/env.ts:76-77`. |
| Sierra custom symbols | `SierraBridgePanel` custom-symbol entry + on-the-fly terminal command (`src/App.tsx:138-146`) → `POST /api/sierra-bridge/sync` → `SierraBridgeController.sync:8-17` → `SierraMarketProviderAdapter.syncSierra:69-99` → stored in `sierraConfig.customSymbols`. |

---

## 2. Where each value is persisted

| Value | Persisted? | Location |
|---|---|---|
| `universe` | Yes | `data/scanner-config.json` via `ScannerConfigRepository.save/flush` (`server/scanner/ScannerConfigRepository.ts:52-63`) |
| Watchlist | Yes | `data/watchlist.json` via `WatchlistRepository.flush` (`server/scanner/WatchlistRepository.ts:88-97`) |
| Entitlement | No (env-derived, always recomputed) | — |
| Sierra custom symbols | **No** — in-memory only, lost on restart (`server/providers/SierraMarketProviderAdapter.ts:39-45`, `server/types/market.ts:6`) | — |

---

## 3. Where each value is consumed

| Value | Consumed by |
|---|---|
| `universe` | `getConfig` returns it (`ScannerConfigController.ts:15-24`); client mirrors type (`useScannerConfig.ts:34`). **That is all.** |
| Watchlist | Frontend `ScannerGrid.filteredMarkets:82` (`watchlistSymbols.has(m.symbol)`) — pure display filter. Server-side: `ScannerConfigController` uses `watchlist.size()/has()` for CRUD + limit checks (lines 59, 100-101). |
| Entitlement | `addSymbol:59`, `bulkAddSymbols:103`; badge display `ScannerGrid.tsx:183`. |
| Sierra symbols | `syncSierra:80-85` → `subscribeSymbol:138-157` → `dtcProvider.subscribeMarketData` → snapshot events → `scannerEngine.onMarketSnapshot` → full scan pipeline → `MarketCacheService` (`server/services/MarketCacheService.ts:17-23`) → REST `GET /api/market-data` + WS (`kind:"all"`). This is the **only** path that adds symbols to actual processing at runtime. |

---

## 4. Where each value is NOT consumed (despite being "part of the architecture")

- **`ScannerConfig.universe` — dead field.** Global grep finds only type defs, defaults, and a round-trip in migration (`ScannerConfigRepository.ts:33`). Nothing in `ScannerEngine`, `EventPipeline`, either provider, `MarketCacheService`, or any UI component reads it. The comment says `// empty = use all tracked symbols` — the "tracked symbols" it would reference are never defined in terms of it.
- **`WatchlistRepository.getSymbols()`** (`WatchlistRepository.ts:46-48`) has **zero callers** in the server outside the controller. Adding a symbol to the watchlist does **not** subscribe it on Sierra, add it to mock, or create scan state.
- **`EntitlementService.checkLiveDataPermission()`** (`EntitlementService.ts:57-66`) is defined and **never called**. Sierra DTC sync/connect is completely un-gated by tier despite `liveDataEnabled`.
- **WS `SubscriptionManager` "watchlist" kind** (`server/realtime/SubscriptionManager.ts:11-12,84-88`) is a client-supplied symbol list — unrelated to `WatchlistRepository`.
- **`ScannerGrid` "Universe" button** (`ScannerGrid.tsx:186-189`) toggles `showUniverseManager`, but **no panel is ever rendered** using it — the universe-management UI is a stub (same for the "Columns" picker).
- `marketCache.seed(initialMarkets)` in the Sierra adapter (`SierraMarketProviderAdapter.ts:47-48`) seeds cache/baselines but never seeds scan state — the seeded symbols show in the UI grid but have no `EventPipeline` state until DTC data arrives.

---

## 5. What actually determines which symbols the scanner processes

The set is **whatever events the provider pushes**, nothing else:

- **Mock provider**: fixed `initialMarkets` (10 symbols, `server/mock/initialMarkets.ts`) + any `customSymbols` via `syncSierra` → `addMockSierraSymbol` (`MockMarketProvider.ts:147-174`).
- **Sierra provider**: `initialMarkets` display-seeded (cache only), plus DTC subscriptions created **only** from `customSymbols` passed through `/api/sierra-bridge/sync`. `SierraDtcProvider.resubscribeAll()` re-subscribes only those.
- `EventPipeline.resolveState` (`server/scanner/EventPipeline.ts:113-128`) **lazily creates** a `SymbolState` for any symbol that emits an event — there is no universe-check before doing so.

Net: *universe and watchlist have zero effect on what is scanned.* If a symbol is in `ScannerConfig.universe` or `watchlist.json` but no provider event arrives, **no scan state exists for it**. There is no `getUniverse`/`resolveUniverse`/`getSymbolsForScan` anywhere.

---

## 6. Where MAX_SYMBOLS / entitlement limits are actually enforced

Only **2** call sites, both gating the **watchlist file write** in `ScannerConfigController`:

- `addSymbol:59` → `checkSymbolLimit(this.watchlist.size())` (403 at `>= maxSymbols`)
- `bulkAddSymbols:103` → `currentCount + newSymbols.length > ent.maxSymbols`

**NOT enforced on:** Sierra DTC subscriptions (`SierraBridgeController` has no entitlement dependency), `MarketCacheService` size, `ScannerEngine.results`/`EventPipeline.states` size, mock-symbol adds. A "free" deploy can subscribe an unbounded number of custom Sierra symbols and display/serve them all; a free user also sees all 10 seeded `initialMarkets` in the grid regardless of the 10-symbol watchlist cap (badge reads `watchlist.length/maxSymbols`, not actual displayed count — `ScannerGrid.tsx:183`).

---

## 7. Can the current design safely support a customer-defined futures universe?

**No.** Specifically:

- `universe` is dead and unreconciled with `watchlist` and `sierraConfig.customSymbols` — there is no layer that turns a customer's futures list into DTC subscriptions.
- Limits enforce only `watchlist.json` size, so a customer-defined futures universe could exceed the entitlement silently.
- Custom symbols are never persisted — a customer's universe vanishes on restart.
- Asset class is **inferred** from the symbol string in `mapMarketSnapshot.ts:21-25` (`...defaults "FUTURES"`), not defined by the customer; a typo'd/unverifiable ticker is permanently seeded with a **fake price** (`basePrice = 1.25 if includes "USD" else 100`, `SierraMarketProviderAdapter.ts:143`) and appears as a live market, feeds `runAiAnalysis(data.markets)` (`App.tsx:87`), and persists as zombie scan state.
- Futures pip/contract conventions aren't modeled (`ScannerGrid.tsx:152-153`, `142`).

---

## 8. Are there competing sources of truth for the active universe?

**Yes — five un-reconciled sets:**

1. `ScannerConfig.universe` — declared intent, dead (`scanner-config.json`)
2. `watchlist.json` — persisted, UI display filter only
3. `SierraConfig.customSymbols` — in-memory, the *actual* subscription source
4. `MarketCacheService` cache — de-facto "available/displayed" set (seed + scan results)
5. `ScannerEngine.results` / `EventPipeline.states` — actual processed set

Plus `initialMarkets` (`server/mock/initialMarkets.ts`) as a hardcoded baseline constant. None of them validates against or derives from the others.

---

## 9. What happens when Sierra provides a custom symbol not in the configured universe

It is **silently admitted, with fabricated data**:

- `subscribeSymbol` (`SierraMarketProviderAdapter.ts:138-157`) checks only market cache presence (`!this.marketCache.has(symbolUpper)`) — never universe, watchlist, entitlement, or asset-class validity. It seeds a fake `MarketSnapshot` with `assetClass:"UNKNOWN"`, base price `100` (or `1.25`), pushes it through the scan engine, then sends the DTC subscribe.
- Result: permanent `SymbolState` + `ScannerEngine.results` entry + `MarketCacheService` entry → appears in the grid immediately (WS `kind:"all"`), triggers AI analysis, and **never gets removed** even if DTC returns nothing.
- Not persisted; on restart the symbol is gone unless re-entered.

---

## 10. Smallest architectural change for a single authoritative universe-resolution layer

Add one server-side resolver — a `UniverseService` — as the **single write gate and single read source** for the active symbol set:

- Canonical set = `normalize(watchlist ∪ sierraCustomSymbols)` (uppercase, de-duped), capped at `maxSymbols`, filtered to allowed asset classes (FUTURES-only mode optional).
- All mutations route through it: watchlist-add, sierra-sync, terminal symbol creation. *No direct repo/provider writes elsewhere.*
- Providers subscribe from it; `subscribeSymbol`/`addMockSierraSymbol` become consumers of the resolved set, and incoming snapshots are validated against it (drop or quarantine unknown symbols instead of fabricating prices).
- Persist `sierraConfig.customSymbols` (e.g., a `"source"` tag on `WatchlistSymbol`, or a small `universe.json`) so the universe survives restart.
- Entitlement checks move to the union, not `watchlist.size()`.

---

## A. Current flow

```
Env: ENTITLEMENT_TIER / MAX_SYMBOLS ─► EntitlementService (free=10 / paid=200)
                                          │ gate: watchlist.json size only (ScannerConfigController:59,103)
                                          ▼
Watchlist (data/watchlist.json) ─► REST /api/scanner/watchlist ─► ScannerGrid display filter only (line 82)
ScannerConfig.universe (data/scanner-config.json) ─► REST /api/scanner/config ─► no consumer at all
                                    │
SierraBridgePanel / terminal <GO> ─► POST /api/sierra-bridge/sync
                                    ▼
SierraMarketProviderAdapter.syncSierra → sierraConfig.customSymbols (in-memory)
                                    ▼
subscribeSymbol → seed fake snapshot ─► ScannerEngine.onMarketSnapshot
                                    │       │
                                    ▼       ▼
                    EventPipeline.resolveState (lazy, unconditional) → indicators → ScoredScannerResult
                                                                        │
                                                ScannerEventBridge → EventBus("scanner:result")
                                                                        │
                                        MarketCacheService ─► GET /api/market-data + WS ─► ScannerGrid rows
                                        (also seeded with initialMarkets at startup, mock & sierra both)
```

Providers push → engine accepts everything; watchlist and universe never touch this path.

---

## B. Problems found

1. `ScannerConfig.universe` is dead code — no writer in UI, no reader in server or UI.
2. **5 competing universe definitions** never reconciled (§8).
3. Entitlement limits enforce only watchlist file size; the *actually-processed* set is unbounded (free tier can run unlimited Sierra symbols).
4. `checkLiveDataPermission()` / `liveDataEnabled` unused — Sierra connect is not gated by tier.
5. Sierra custom symbols are **never persisted** — universe lost on restart.
6. Unknown/off-universe Sierra symbols are accepted with **fake seeded prices**, never validated, never evicted → phantom markets, corrupted baselines/scan state, false AI briefings.
7. Watchlist ↔ DTC subscription round-trip doesn't exist: adding a watchlist symbol doesn't subscribe it; subscribing Sierra doesn't add to watchlist.
8. Futures support unsafe: asset class inferred by string heuristics; no pip/tick conventions; no per-customer futures list anywhere.
9. UI stubs: "Universe" and "Columns" panels toggle but render nothing.
10. Stray artifact `src/components/ScannerGrid.part1.txt` (dead partial file).

---

## C. Recommended target architecture

```
        ┌─────────────── UniverseService (single source of truth) ───────────────┐
        │  activeSet = union(watchlist, sierra.customSymbols) ∩ assetClasses     │
        │  capped by entitlement.maxSymbols; persisted (universe.json / source tags) │
        └───────┬──────────────────▲──────────────────▲──────────────────────────┘
                │ writes           │ reads            │ gates
     addWatchlist / sierraSync /   │                  │
     terminal <GO>                 │                  ▼
                ▼                  │    ScannerEngine / EventPipeline
        MarketProvider(s) ◄────────┘    (validate every incoming snapshot against activeSet)
        subscribe only activeSet
```

- Entitlement ↔ `UniverseService`: limits enforced at resolution time, not at file-write time.
- Sierra ↔ Universe: custom symbols become *requests* that must pass through the resolver before subscription; unverifiable ticks go to "pending/unknown", never seeded with fake prices.
- Universe → UI: grid renders `resolve(activeSet)`, so behavior matches what's enforced.

---

## D. Smallest safe implementation plan

1. Add `UniverseService` (pure resolver, no I/O): `resolve(): Set<string>` = `union(normalize(watchlist.getSymbols()), normalize(sierraConfig.customSymbols))` capped at `maxSymbols`. Unit-testable.
2. Persist Sierra custom symbols: extend `WatchlistSymbol` with optional `source: "watchlist" | "sierra"` (or new `universe.json`). Migration-compatible (older files default source to watchlist).
3. Wire writes through the resolver: `ScannerConfigController.addSymbol` and `SierraMarketProviderAdapter.syncSierra` both call the resolver; move entitlement check to the union.
4. Make providers consumers: `subscribeSymbol`/`addMockSierraSymbol` subscribe only resolver output; remove fake-price seeding (push a "pending" placeholder without feeding `onMarketSnapshot`).
5. Add an inbound snapshot guard in `ScannerEngine`/adapter: drop or quarantine snapshots for symbols not in `activeSet` (log + WS event), preventing zombie state.
6. Surface a new `GET /api/scanner/universe` exposing resolved set + limit, so the UI can build the real Universe manager.
7. (Optional follow-ups) enforce `checkLiveDataPermission`, asset-class gating for FUTURES-only deployments, grid fix for badge count.

---

## E. Files that would need to change

- `server/scanner/WatchlistRepository.ts` — add `source` tag / universe persistence
- `server/controllers/ScannerConfigController.ts` — route adds through resolver; union-based limit
- `server/controllers/SierraBridgeController.ts` — pass through resolver, apply entitlement gate
- `server/providers/SierraMarketProviderAdapter.ts` — remove fake seeding; subscribe from resolver
- `server/providers/MockMarketProvider.ts` — `addMockSierraSymbol` from resolver
- `server/providers/MarketProvider.ts` — expose universe set if provider-side consumed
- `server/services/index.ts` — construct/inject `UniverseService`
- `server/scanner/ScannerConfig.ts` (+ repo) — optionally drop/repurpose `universe` field; bump `SCANNER_CONFIG_VERSION`
- **NEW** `server/services/UniverseService.ts` (core of the change)
- `server/types/market.ts` — extend `SierraConfig` / `WatchlistSymbol`
- `src/hooks/useScannerConfig.ts` — client mirror of `source` tag / resolved universe
- `src/components/ScannerGrid.tsx` — real Universe manager; correct badge count
- `src/components/SierraBridgePanel.tsx` / `src/App.tsx` — surface pending/unknown states
- Tests + docs (`ARCHITECTURE.md`, `DATA_FLOW.md`)

---

## F. Files that must remain untouched

- `server/scanner/ScannerEngine.ts`, `EventPipeline.ts`, `SymbolState.ts`, all indicator modules (`ADR/ATR/RelativeVolume/VWAP/Delta/VolumeProfile/OrderFlow/SessionMetrics/Regime/Signals/Scoring.ts`)
- `server/providers/sierra/*` (SierraDtcProvider, DtcBinaryCodec, codec/dtc constants, buffer utils) — protocol layer unaffected
- `server/entitlement/EntitlementService.ts` (logic is fine; enforcement location changes, not the service)
- `server/realtime/*`, `server/events/EventBus.ts`, `ScannerEventBridge.ts`
- `server/services/MarketCacheService.ts`, `MarketDataService.ts`
- `server/baseline/*`, `server/persistence/*`, `server/journal/*`, `server/trade/*`, `server/gemini/*`, `server/health/*`, `server/metrics/*`
- `server/config/env.ts`, `server/config/types.ts` (no new env needed)
- `src/hooks/useMarketSocket.tsx`, `src/components/TerminalHeader.tsx`, `MarketDetailPanel.tsx`, `MarketHeatmap.tsx`, `AIPredictionPanel.tsx`
