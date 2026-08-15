# ScannerEngine Quantitative Audit

Audit of every calculation module as used by `ScannerEngine` / `EventPipeline`.
No new scanner features were added. Changes are limited to numerical stability,
correctness vs documented formulas, performance, and tests.

`server/providers/sierra/` was not modified.

---

## Summary of improvements

| Metric | Stability | Performance | Correctness |
|--------|-----------|-------------|-------------|
| VWAP | Non-finite guards; distance requires volume | O(1) volume MA via running sum | Unchanged formula |
| ATR | Session H/L inflation dampened; inverted OHLC; period guard | — | Tick-path TR proxy when session range is fed as bar OHLC |
| Relative Volume | Invalid timestamps/volumes; curve CDF clamped | — | Expected = ADV × CDF(curve) |
| Delta | Size/price guards; divergence finite checks | — | Zero-tick now matches documented 50/50 split |
| Volume Profile | Integer tick-index keys | Same amortized VA | Float-safe POC lookup |
| Value Area | — | — | Tie → expand **both** sides (Market Profile / Sierra) |
| Regime | ATR floor for slope norm; skip NaN prices | — | Bounded trendStrength |
| Shared math | safeDivide / Wilder / slope hardened | Ring buffer returns eviction | — |

---

## 1. VWAP

### Mathematics
\[
\mathrm{VWAP}_t = \frac{\sum_i p_i q_i}{\sum_i q_i}
\]
Session cumulative form, identical to Bloomberg VWAP and TradingView session VWAP when inputs are trade prints (price × size).

Reclaim / rejection:
\[
p_{t-1} < \mathrm{VWAP}_{t-1},\quad p_t > \mathrm{VWAP}_t,\quad q_t > 1.5 \cdot \mathrm{MA}_{20}(q)
\]
(and the mirror for rejection).

### Institutional comparison
Matches standard session VWAP. Does **not** implement anchored VWAP, band σ, or exchange official VWAP windows — out of scope.

### Weaknesses found
1. No guards on `NaN` / non-positive volume → corruption of `vwapCumPV`.
2. `distanceFromVwap` used `vwap <= 0`, which is a poor proxy for “uninitialized”.
3. Volume MA used `Array.reduce` every trade (O(n)).

### Improvements
- Reject non-finite price/volume and `volume <= 0`.
- Distance returns 0 unless `vwapCumV > 0`.
- Running sum `volumeMaSum` with eviction from `pushRingBuffer`; periodic resync if sum drifts negative/non-finite.

---

## 2. ATR

### Mathematics
True range (Wilder):
\[
\mathrm{TR} = \max(H-L,\, |H-C_{prev}|,\, |L-C_{prev}|)
\]
Smoothing (Wilder / TradingView RMA):
\[
\mathrm{ATR}_t = \frac{\mathrm{ATR}_{t-1}(n-1) + \mathrm{TR}_t}{n},\quad n=14
\]

### Institutional comparison
TradingView `ta.atr` / Wilder uses an initial SMA of the first *n* TRs. This engine seeds with the first TR (common streaming approximation) or a BaselineStore `atr20Day`. Acceptable for realtime; not identical to chart ATR until many bars elapse.

### Weaknesses found
1. **Critical:** Sierra/mock snapshots often send **session** high/low. Feeding that into TR each tick drives ATR toward the full day range — useless for volatility classification.
2. Inverted high/low not sanitized.
3. `wilderSmooth` with `period <= 0` could divide poorly.
4. Non-finite closes could poison state.

### Improvements
- Detect inflated session ranges (`span > 3·ATR` or `span > 5·|Δclose|`) and collapse H/L to close so TR becomes \(|C - C_{prev}|\) (standard tick ATR proxy).
- `sanitizeHighLow` swaps inverted OHLC.
- Period fallback to `ATR_PERIOD`; ignore non-finite closes; skip invalid TR.

---

## 3. Relative Volume

### Mathematics
\[
\mathrm{RVol} = \frac{V_{\mathrm{session}}(t)}{V_{\mathrm{expected}}(t)}
\]
With intraday curve:
\[
V_{\mathrm{expected}}(t) = \mathrm{ADV} \cdot F(t),\quad F(t)=\sum_{k=0}^{b(t)} c_k
\]
Without curve: \(V_{\mathrm{expected}} = \mathrm{ADV}\).

### Institutional comparison
Same structure as Trade Ideas / TrendSpider RVOL (volume vs time-of-day average). Curve here is seeded/synthetic until live session history refreshes BaselineStore — not a multi-day empirical curve yet.

### Weaknesses found
1. Invalid `receivedAt` → `Date` NaN → corrupt fraction.
2. Negative session volume accepted.
3. `Math.max(1, …)` floor distorted RVol for tiny ADV instruments.

### Improvements
- Finite checks on volume and price; keep prior session volume on bad input.
- Invalid timestamps fall back to full-session ADV.
- Expected volume floor is `Number.EPSILON · ADV·F`, not a hard `1`.
- Curve fraction clamped to `(0, 1]`.

---

## 4. Delta

### Mathematics
\[
\Delta = \sum_i \varepsilon_i q_i,\quad \varepsilon_i \in \{+1,-1\}
\]
Lee-Ready-style tick rule when aggressor unknown; zero-tick documented as 50/50.

### Institutional comparison
Feed-provided aggressor (from DTC trade flags) is preferred — correct. Tick rule is the standard fallback. Full Lee-Ready also uses quote midpoint; we do not (no feature add).

### Weaknesses found
1. Comment promised 50/50 on unchanged ticks; implementation returned signed 0 **and** did not accrue buy/sell halves — imbalance denominator undercounted.
2. Zero-size / NaN trades not rejected.
3. Divergence used `-Infinity` comparisons unsafely.

### Improvements
- Zero-tick: `signedVolume = 0`, `buyVolume = sellVolume = size/2`.
- Guard non-finite price and `size <= 0`.
- Divergence requires finite `sessionHigh` / `sessionDeltaHigh`.

---

## 5. Volume Profile

### Mathematics
Histogram of volume by price bucket; POC = argmax bucket volume.

### Institutional comparison
Same structure as Sierra Volume Profile / Bookmap histograms. Tick size drives bucket width.

### Weaknesses found
1. **Critical:** Bucket keys were `round(price/tick)*tick` (float). `indexOf(poc)` could fail → wrong value area start.
2. `poc === 0` used as “unset” — invalid for near-zero prices.

### Improvements
- Store **integer tick indices** as Map keys; convert to price only for `poc` / `vah` / `val`.
- POC lookup via exact integer `indexOf`, with volume re-scan fallback.
- Reject non-finite / non-positive size trades.

---

## 6. Value Area

### Mathematics
CBOT Market Profile expansion: start at POC, add adjacent levels until
\[
V_{\mathrm{captured}} \ge 0.70 \cdot V_{\mathrm{total}}
\]

### Institutional comparison
Sierra Chart / Market Profile: on a **tie** between upper and lower adjacent volumes, **both** levels are added. Prior code preferred the low side only (`>=`).

### Improvements
- Equal adjacent volumes → expand both indices and add both volumes in one step.
- Prefer strictly greater side when unequal; retain edge fallbacks.

---

## 7. Regime detection

### Mathematics
OLS slope over recent prices, normalized by ATR:
\[
s = \frac{\widehat{\beta}}{\max(\mathrm{ATR},\, |p|\varepsilon,\, \epsilon)}
\]
Combined with value-area position, RVol class, ADR class, opening-range breakout.

### Institutional comparison
Heuristic regime labeler — not HMM/Kalman. Reasonable for a scanner scorecard; not a research-grade regime model.

### Weaknesses found
1. `slope / ATR` with ATR ≈ 0 → huge `trendStrength`.
2. NaN prices entered the slope window.
3. `linearSlope` did not skip non-finite samples.

### Improvements
- ATR normalization floor: `max(ATR, |price|·1e-6, ε)`.
- Only push finite prices; slope skips non-finite; clamp strength to `[0, 100]`.

---

## 8. Shared math / ADR

- `safeDivide` rejects non-finite numerator/denominator/result.
- `wilderSmooth` no-ops on bad inputs; `period <= 0` returns `value`.
- `pushRingBuffer` returns evicted value (enables O(1) MA).
- `linearSlope` skips non-finite Y values but **keeps original X indices** so gaps do not compress the time axis.
- `sanitizeHighLow` for ADR and ATR.
- ADR ignores non-finite price and non-positive baselines.

---

## Tests added

| File | Coverage |
|------|----------|
| `atr.test.ts` | Wilder step, session-range dampening, inverted OHLC, classify |
| `relativeVolume.test.ts` | Flat ADV, curve CDF, bad inputs, classify |
| `valueArea.test.ts` | Float-safe POC, tie expansion, guards |
| `regime.test.ts` | Rotation/breakout, ATR floor, NaN prices |
| `mathStability.test.ts` | Delta 50/50, VWAP guards, MA sum, math helpers |
| Existing VWAP/Delta/VP/Engine tests retained |

---

## Remaining known limitations (not changed)

1. ATR still approximates chart ATR (first-TR seed vs SMA seed of n bars).
2. RVol curve is seeded, not a true multi-day empirical intraday average.
3. Delta lacks quote-mid Lee-Ready (needs bid/ask at trade time).
4. Regime is rule-based, not probabilistic.
5. Snapshot-synthesized VWAP volume deltas can still fire reclaim logic — pre-existing pipeline behavior.

---

## Verification

Commands: `npm run lint`, `npm test`, `npm run build`.
