# Sierra DTC Live-Data Diagnosis — Empty Snapshots (live-proven 2026-09-25)

## TL;DR

The pipe is healthy. **Two Sierra-side facts** explain every empty grid:

1. **Wrong symbol strings.** Bare expiry codes (`ESZ26`, `YMZ26`, `ZCZ26`)
   are UNKNOWN to Sierra (security type 0, empty description) → Sierra
   returns all-zero snapshots, which the app correctly drops. The exact
   Sierra name is required (File >> Find Symbol), e.g. `ESZ26-CME`.
2. **Sierra refuses to stream CME futures over DTC.** `ESZ26-CME` is a
   known future (`E-MINI S&P 500 FUTURES ES Dec 2026`, secType 1) but the
   server answers every market-data and market-depth request with
   `MARKET_DATA_REJECT / MARKET_DEPTH_REJECT: "Market data request not
   allowed"`. This matches Sierra's official DTC Server restrictions
   (CME Group data not servable over DTC). No client code can override a
   server reject — the app now surfaces it per symbol instead of showing
   silent emptiness.

## Live evidence (this VM → host Sierra `10.0.2.2:11099`, SC Build 56603)

- `SECURITY_DEFINITION_FOR_SYMBOL_REQUEST (506)` for `ESZ26`, `ESU26`,
  `YMZ26`, `ZCZ26`, `F.US.EPZ26` → all `secType=0, desc=""` (unknown).
- `506` for `ESZ26-CME` → `secType=1, desc="E-MINI S&P 500 FUTURES ES
  Dec 2026"` (known future).
- `506` for `EURUSD` → known, streams live trades/quotes/session truth.
- `506` for `CORNF` → known (`desc="Corn"`); ICE corn future exists as
  `ICNZ26-ICEUS`.
- `SYMBOLS_FOR_EXCHANGE_REQUEST (502)` → **2689 definitions**: full
  `-CME / -CBOT / -ICEUS / -NQTV / -NYSE…` futures list plus forex/CFDs.
- `MARKET_DATA_REQUEST (101)` for `ESZ26-CME` → explicit reject
  `"Market data request not allowed"` (depth likewise). Zero trades,
  zero quotes in 25s while Globex is open.
- End-to-end through the real `SierraDtcProvider`: feed states come out
  as `{"ESZ26-CME": {"status":"REJECTED","detail":"Market data request
  not allowed"}, "ESZ26": {"status":"PENDING"}}`.

## What the app does now (generic — zero product names in code)

- DTC 506/507/502 codec + `requestSecurityDefinition(symbol)` with
  cache: any customer-typed symbol (corn, YM, whatever) is validated
  against **Sierra's own universe**, not a list in this repo.
- Per-symbol feed truth `PENDING → STREAMING | REJECTED | UNKNOWN_SYMBOL`
  with Sierra's detail text, exposed via `SierraConfig.symbolStates` and
  rendered in the Bridge panel monitor. Unknown strings are flagged from
  the definition response before any zeros arrive.
- Zero-data guards unchanged: Sierra's all-zero "no data" snapshots are
  dropped, never published as price 0.

## How to get live ES futures (Sierra-side, in order)

1. In Sierra, File >> Find Symbol → use the **exact** string
   (`ESZ26-CME` for Dec-26 E-mini S&P). Type exactly that in the bridge.
2. Open its chart in Sierra with the data feed connected and ticking.
3. Re-probe: if the reject persists, the DTC-server CME restriction is
   in force for this install → request the documented exemption from
   Sierra support, or feed futures through an entitled path (Denali CME
   entitlement / Teton / Rithmic / CQG). Whatever Sierra starts serving,
   this app picks up with no code changes — validation + states are
   fully generic.
4. Sanity proof the pipe is live today: sync `EURUSD` or `CORNF`.
