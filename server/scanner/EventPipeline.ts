import {
  MarketSnapshot,
  OrderBookSnapshot,
  TradePrint,
} from "../types/domain";
import { updateAdr } from "./ADR";
import { updateAtr } from "./ATR";
import { updateDelta } from "./Delta";
import { updateOrderFlow } from "./OrderFlow";
import { updateRelativeVolume } from "./RelativeVolume";
import { detectRegime } from "./Regime";
import { generateSignals } from "./Signals";
import { computeScore } from "./Scoring";
import { updateSessionBounds, updateOpeningRange } from "./SessionMetrics";
import { SymbolState } from "./SymbolState";
import { onTradeVwap, distanceFromVwap } from "./VWAP";
import { updateVolumeProfile } from "./VolumeProfile";
import { buyingPressure, sellingPressure } from "./Delta";
import { bookImbalance } from "./OrderFlow";
import { nowIso } from "./math";
import { ScoredScannerResult, SymbolBaseline } from "./types";

/**
 * Event pipeline: routes normalized market events to incremental metric updaters
 * and assembles a ScoredScannerResult after each processing pass.
 */
export class EventPipeline {
  private readonly states = new Map<string, SymbolState>();
  private readonly baselines = new Map<string, SymbolBaseline>();

  constructor(private readonly baselineResolver?: (symbol: string) => SymbolBaseline | undefined) {}

  seedBaselines(baselines: SymbolBaseline[]): void {
    for (const baseline of baselines) {
      this.baselines.set(baseline.symbol.toUpperCase(), baseline);
    }
  }

  seedBaseline(baseline: SymbolBaseline): void {
    this.baselines.set(baseline.symbol.toUpperCase(), baseline);
  }

  getState(symbol: string): SymbolState | undefined {
    return this.states.get(symbol.toUpperCase());
  }

  getAllSymbols(): string[] {
    return Array.from(this.states.keys());
  }

  processMarketSnapshot(snapshot: MarketSnapshot): ScoredScannerResult {
    const state = this.resolveState(snapshot.instrument);
    state.lastSnapshot = snapshot;
    state.eventCount += 1;

    updateSessionBounds(state, snapshot);
    updateOpeningRange(state, snapshot);
    updateRelativeVolume(state, snapshot);
    updateAdr(state, snapshot);
    updateAtr(state, snapshot);

    if (snapshot.sessionVolume !== undefined && snapshot.sessionVolume > state.vwapCumV) {
      const deltaVol = snapshot.sessionVolume - state.vwapCumV;
      if (deltaVol > 0) {
        onTradeVwap(state, {
          instrument: snapshot.instrument,
          price: snapshot.lastPrice,
          size: deltaVol,
          receivedAt: snapshot.receivedAt,
        });
      }
    }

    state.prevPrice = snapshot.lastPrice;
    return this.finalize(state, snapshot);
  }

  processTradePrint(trade: TradePrint): ScoredScannerResult | null {
    const state = this.resolveState(trade.instrument);
    state.eventCount += 1;

    onTradeVwap(state, trade);
    updateDelta(state, trade);
    updateVolumeProfile(state, trade);

    state.sessionVolume += trade.size;
    if (state.sessionHigh < trade.price) state.sessionHigh = trade.price;
    if (state.sessionLow > trade.price) state.sessionLow = trade.price;

    const snapshot = state.lastSnapshot ?? this.buildSnapshotFromTrade(trade);
    snapshot.lastPrice = trade.price;
    snapshot.sessionVolume = state.sessionVolume;
    snapshot.high = state.sessionHigh;
    snapshot.low = state.sessionLow;
    state.lastSnapshot = snapshot;

    updateAdr(state, snapshot);
    updateAtr(state, snapshot);
    updateRelativeVolume(state, snapshot);

    return this.finalize(state, snapshot);
  }

  processOrderBookSnapshot(book: OrderBookSnapshot): ScoredScannerResult | null {
    const state = this.resolveState(book.instrument);
    updateOrderFlow(state, book);
    state.eventCount += 1;

    if (!state.lastSnapshot) return null;
    return this.finalize(state, state.lastSnapshot);
  }

  private resolveState(instrument: MarketSnapshot["instrument"]): SymbolState {
    const symbol = instrument.symbol.toUpperCase();

    // OPTIMIZATION: resolve single symbol baseline instead of rebuilding the full Map.
    if (this.baselineResolver) {
      const fresh = this.baselineResolver(symbol);
      if (fresh) this.baselines.set(symbol, fresh);
    }

    let state = this.states.get(symbol);
    if (!state) {
      state = SymbolState.create(instrument, this.baselines);
      this.states.set(symbol, state);
    }
    return state;
  }

  private buildSnapshotFromTrade(trade: TradePrint): MarketSnapshot {
    return {
      instrument: trade.instrument,
      lastPrice: trade.price,
      receivedAt: trade.receivedAt,
    };
  }

  private finalize(state: SymbolState, snapshot: MarketSnapshot): ScoredScannerResult {
    const regime = detectRegime(state, snapshot);
    const signals = generateSignals(state, snapshot.lastPrice, regime);
    const scoring = computeScore(state, snapshot.lastPrice, regime, signals);
    const calculatedAt = nowIso();
    state.lastCalculatedAt = calculatedAt;

    return {
      instrument: state.instrument,
      snapshot,
      metrics: {
        instrument: state.instrument,
        relativeVolume: state.relativeVolume,
        adrFilledPercent: state.adrFilledPercent,
        vwap: state.vwap,
        distanceFromVwap: distanceFromVwap(state, snapshot.lastPrice),
        cumulativeDelta: state.cumulativeDelta,
        valueAreaHigh: state.vah,
        valueAreaLow: state.val,
        pointOfControl: state.poc,
        regime: regime.regime,
        calculatedAt,
        atr: state.currentAtr,
        sessionHigh: state.sessionHigh > -Infinity ? state.sessionHigh : snapshot.lastPrice,
        sessionLow: state.sessionLow < Infinity ? state.sessionLow : snapshot.lastPrice,
        sessionOpen: state.sessionOpen,
        openingRangeHigh: state.openingRangeHigh,
        openingRangeLow: state.openingRangeLow,
        openingDrive: state.openingDrive,
        vwapReclaim: state.vwapReclaim,
        vwapRejection: state.vwapRejection,
        buyingPressure: buyingPressure(state),
        sellingPressure: sellingPressure(state),
        tradeImbalance: state.tradeImbalance,
        bidAggression: state.bidAggression,
        askAggression: state.askAggression,
        trendStrength: scoring.trendStrength,
        signalStrength: scoring.signalStrength,
        confidence: scoring.confidence,
        volatilityClass: state.volatilityClass,
        subRegime: regime.subRegime,
      },
      signals,
      score: scoring.score,
      grade: scoring.grade,
      rationale: scoring.rationale,
      calculatedAt,
      confidence: scoring.confidence,
      trendStrength: scoring.trendStrength,
      signalStrength: scoring.signalStrength,
    };
  }
}
