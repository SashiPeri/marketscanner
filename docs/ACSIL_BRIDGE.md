# ACSIL Bridge — Live CME Futures From Your Sierra (Denali) Feed

## Why this exists

Sierra's DTC Protocol **server** refuses to stream CME Group data:

- `MARKET_DATA_REJECT: "Market data request not allowed"` for `ESZ26-CME`
  (live-proven 2026-09-25 vs SC Build 56603, Globex open).
- Sierra support's verdict on this exact error: *"You can not get access
  to the CME data using DTC as the exchanges do not allow it to be resent
  in the manner you want it."*

A custom study runs **inside** Sierra Chart and sees everything your
Denali CME subscription delivers. `acsil/MarketScannerBridge.cpp`
forwards the chart's trades, quotes, and depth to the scanner over TCP.
Same normalized pipeline on our side — no scanner/cache/UI changes.

## Setup (Windows host)

1. Copy `acsil/MarketScannerBridge.cpp` into Sierra's `ACS_Source` folder.
2. Sierra menu: **Analysis >> Build Custom Studies DLL**. Wait for success.
   (Requires the free Microsoft Visual C++ build tools on first use —
   Sierra prompts if missing.)
3. Open a chart for the product you want, e.g. `ESZ26-CME` (File >>
   Find Symbol for the exact name), with the Denali feed connected.
4. **Analysis >> Studies >> Add "Market Scanner Bridge"** to that chart.
5. Study Settings:
   - `Scanner host` = IP of the machine running the scanner, as seen
     **from the Windows host**. The Linux VM is `10.0.2.15` (VirtualBox
     NAT default; verify with `ip addr` in the VM).
   - `Scanner port` = `ACSIL_PORT` (default `18199`).
   - `Enabled` = Yes.
6. One chart per product: ES chart streams ES, corn chart streams corn,
   YM chart streams YM. The scanner demultiplexes by symbol — type any
   symbol in the bridge panel, open its chart, add the study, done.

## Scanner side

1. `.env`: `MARKET_PROVIDER="acsil"` (and `ACSIL_PORT="18199"`).
2. Start the app (`npm run dev`). The feed listens on `0.0.0.0:18199`.
3. Bridge panel >> CONNECT & SYNC with your symbols
   (e.g. `ESZ26-CME`, `ZCZ26-CBOT`, `CORNF` — whatever you opened).
4. Bridge monitor shows per-symbol truth: `PENDING` (waiting for the
   study) → `STREAMING` (ticks flowing). No silent empty grids.

## Failure modes (honest list)

- Study can't connect (wrong host/port, firewall): scanner shows
  `PENDING`; Sierra Message Log shows the study's connect notes.
- Chart has no live data (feed disconnected): nothing is sent, nothing
  is faked — `PENDING` until ticks arrive.
- The `.cpp` is compiled on your host, not here: if Sierra's compiler
  reports an error, it names the exact line — only documented ACSIL
  members are used (Time & Sales, market depth, persistent ints,
  string/int/yes-no inputs), so it tracks the public interface.

## Verify without Sierra (developer)

The Node side is fully tested without Windows:

- `npm run test` — protocol, TCP feed, and provider suites.
- Live shape: any TCP client sending the JSON lines from
  `acsil/MarketScannerBridge.cpp` header into `ACSIL_PORT` appears in
  the grid (proven with `npx tsx` + raw socket: `ESZ26-CME@6642.5`,
  `ZCZ26-CBOT@500.25` through the real `ScannerEngine`).
