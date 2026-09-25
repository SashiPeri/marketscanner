# Sierra DTC Live-Data Fix — Empty Snapshots (2026-09-25, live-proven)

## Symptom

DTC TCP + logon + subscribe succeed against Sierra (`10.0.2.2:11099`,
`SC DTC Server Build=56603`, logon result=1), but the app receives
all-zero `MARKET_DATA_SNAPSHOT` (144-byte, every price field 0) and
publishes nothing. The zero-guards correctly drop these, so the scanner
stays empty.

## Live probe evidence (20s, `dtc-live-probe`, this VM → host Sierra)

- `ESZ25, NQZ25, ESU26, NQU26, ESZ26, NQZ26` → all-zero snapshot each,
  zero follow-up messages (no trades, no bid/ask, no rejects).
- `EURUSD` → zero snapshot, then **live** data: `LAST_TRADE_SNAPSHOT`
  (134), session open/high/low/volume (120/114/115/113), settlement
  (119), continuous `BID_ASK_COMPACT` (117) streaming.
- `BTCUSD` → explicit `[103 MARKET_DATA_REJECT] "Market data request
  not allowed"`.
- One `[116 SYMBOL_STATUS]` + `[135 OPEN_INTEREST]` observed (forex path).

Conclusion: **the DTC pipe is healthy; Sierra is refusing/emptying
specific symbols.** The app code was right to drop zeros.

## Root causes (Sierra-side, per official docs + probe)

1. **Exchange restriction (biggest).** Sierra's DTC Server docs
   (`DTCServer.php`, modified 2026-09-02, Restrictions section):
   > "It is not possible to access real-time or historical data from the
   > CME Group of exchanges, EUREX, NASDAQ, CBOE, US equities … from the
   > DTC Protocol server."
   ES/NQ are CME products → Sierra empties/blocks them over DTC.
   BTCUSD got an explicit reject; ES/NQ got silent zeros.
2. **Expired contracts.** `ESZ25/NQZ25` (Dec 2025) are expired on
   2026-09-25. Even without the restriction they carry no live tick.
   Front months are `ESU26/NQU26` (Sep 2026) → `ESZ26/NQZ26`.
   Probe shows even those return zeros → restriction, not just expiry.
3. **Symbol must be exact, Exchange ignored.** Sierra docs: "The DTC
   Server does not use the Exchange field … set Symbol to the exact
   symbol as used within Sierra Chart (File >> Find Symbol)."
   Sending `ESZ25-CME` or a wrong alias yields empty snapshots.
4. **No chart open / feed disconnected.** Sierra only serves symbols
   with an open chart + connected data feed. No chart → zeros.
5. **Non-local IP restriction.** "Streaming/historical from an IP other
   than local machine is not possible" without an exchange-approved
   exemption. This VM (`10.0.2.15`) is non-local to Sierra, yet forex
   flows — so the block is per-exchange, but a locked-down
   `Allowed Incoming IPs` / `Require Authentication` can still bite.

## Sierra-side checklist (Sashi, on the Windows host)

1. Global Settings >> Sierra Chart Server Settings >> DTC Protocol Server:
   Enable=Yes, Listening Port=11099, Allowed Incoming IPs=Any IP (or at
   least Local Subnet), Require Authentication as needed (username +
   password must then match SC login).
2. File >> Find Symbol → copy the **exact** symbol string Sierra shows
   (e.g. `ESU26`), use that verbatim in the scanner sync.
3. Open a live chart for each symbol + confirm the data feed is
   connected (Message Log shows download/connection, chart ticks live).
4. For CME/NASDAQ live via DTC: contact Sierra support for the
   documented exemption, or route futures through a licensed path
   (Denali/Teton/Rithmic/CQG data service) instead of the DTC server.
5. Quick proof the pipe works end-to-end today: sync `EURUSD` — it
   streams live through this exact code path.

## Code changes in this repo

- `server/providers/sierra/dtcConstants.ts`: added
  `MARKET_DATA_UPDATE_OPEN_INTEREST (135)` (observed live, previously
  unlisted).
- `server/providers/sierra/SierraDtcProvider.ts`: explicitly ignore
  open-interest (no scanner truth) and **debug-log** `FEED_STATUS`
  (100) / `SYMBOL_STATUS` (116) so the next empty-feed episode leaves
  traces without a raw probe. Zero-snapshot drop + warn-once + reject
  logging with symbol (prior `feat/feed-truth` work) is unchanged —
  it is the correct behavior.
- Added `MARKET_DATA_UPDATE_OPEN_INTEREST` coverage in
  `server/providers/__tests__/codec.test.ts` (constant listed).

## Path forward for live ES/NQ

- Short term: demo/verify realtime with `EURUSD` (proven live); keep
  futures on `mock` until a licensed feed exists.
- Medium term: licensed futures feed (Denali/Teton/Rithmic/CQG) or
  Sierra-approved DTC exemption for CME; then re-probe with exact
  front-month symbols and open charts.
- Re-probe command: copy `/tmp/opencode/dtc-live-probe.ts` into the
  repo dir and run `npx tsx ./dtc-live-probe.tmp.ts` (dotenv must
  resolve from repo root).
