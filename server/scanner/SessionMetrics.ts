import { MarketSnapshot } from "../types/domain";
import { SCANNER_CONSTANTS } from "./constants";
import { parseTimestampMs } from "./math";
import { SymbolState } from "./SymbolState";

/** Update session high/low/open from a market snapshot. */
export function updateSessionBounds(state: SymbolState, snapshot: MarketSnapshot): void {
  const price = snapshot.lastPrice;

  if (snapshot.open !== undefined && state.sessionOpen === undefined) {
    state.sessionOpen = snapshot.open;
  }
  if (state.sessionOpen === undefined) {
    state.sessionOpen = price;
  }

  if (snapshot.high !== undefined) {
    state.sessionHigh = Math.max(state.sessionHigh, snapshot.high);
  } else {
    state.sessionHigh = Math.max(state.sessionHigh, price);
  }

  if (snapshot.low !== undefined) {
    state.sessionLow = Math.min(state.sessionLow, snapshot.low);
  } else {
    state.sessionLow = Math.min(state.sessionLow, price);
  }

  if (snapshot.previousClose !== undefined) {
    state.previousClose = snapshot.previousClose;
  }
}

/**
 * Opening Range (OR): high/low captured during the first N minutes of the session.
 * Opening Drive: directional move from session open through the OR window.
 */
export function updateOpeningRange(state: SymbolState, snapshot: MarketSnapshot): void {
  const ts = parseTimestampMs(snapshot.providerTimestamp ?? snapshot.receivedAt);

  if (state.sessionStartMs === undefined) {
    state.sessionStartMs = ts;
  }

  const elapsedMinutes = (ts - state.sessionStartMs) / 60_000;
  const price = snapshot.lastPrice;
  const high = snapshot.high ?? price;
  const low = snapshot.low ?? price;

  if (!state.openingRangeSet && elapsedMinutes <= SCANNER_CONSTANTS.OPENING_RANGE_MINUTES) {
    state.openingRangeHigh =
      state.openingRangeHigh !== undefined ? Math.max(state.openingRangeHigh, high) : high;
    state.openingRangeLow =
      state.openingRangeLow !== undefined ? Math.min(state.openingRangeLow, low) : low;
  } else if (!state.openingRangeSet && elapsedMinutes > SCANNER_CONSTANTS.OPENING_RANGE_MINUTES) {
    state.openingRangeSet = true;
    classifyOpeningDrive(state, price);
  }
}

function classifyOpeningDrive(state: SymbolState, price: number): void {
  const open = state.sessionOpen ?? price;
  const orHigh = state.openingRangeHigh ?? price;
  const orLow = state.openingRangeLow ?? price;
  const orMid = (orHigh + orLow) / 2;

  if (price > orMid && price > open) {
    state.openingDrive = "UP";
  } else if (price < orMid && price < open) {
    state.openingDrive = "DOWN";
  } else {
    state.openingDrive = "FLAT";
  }
}

/** Detect opening range breakout above OR high. */
export function isOpeningRangeBreakoutUp(state: SymbolState, price: number): boolean {
  return (
    state.openingRangeSet &&
    state.openingRangeHigh !== undefined &&
    price > state.openingRangeHigh
  );
}

/** Detect opening range breakdown below OR low. */
export function isOpeningRangeBreakoutDown(state: SymbolState, price: number): boolean {
  return (
    state.openingRangeSet &&
    state.openingRangeLow !== undefined &&
    price < state.openingRangeLow
  );
}
