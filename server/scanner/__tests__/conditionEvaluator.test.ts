import { describe, expect, it } from "vitest";
import { ConditionEvaluator } from "../ConditionEvaluator";
import { ConditionSet } from "../ConditionSet";
import { StudyValueStore } from "../StudyValueStore";
import { ScoredScannerResult } from "../types";

function result(overrides: Partial<ScoredScannerResult> = {}): ScoredScannerResult {
  const base: ScoredScannerResult = {
    instrument: { symbol: "ES", assetClass: "FUTURES" },
    snapshot: {
      instrument: { symbol: "ES", assetClass: "FUTURES" },
      lastPrice: 5125,
      receivedAt: "2026-09-12T00:00:00.000Z",
    },
    metrics: {
      instrument: { symbol: "ES", assetClass: "FUTURES" },
      relativeVolume: 1.8,
      adrFilledPercent: 72,
      vwap: 5110,
      distanceFromVwap: 15,
      regime: "TRENDING_UP",
      calculatedAt: "2026-09-12T00:00:00.000Z",
    },
    signals: [
      {
        id: "ES-vwap-reclaim-1",
        instrument: { symbol: "ES", assetClass: "FUTURES" },
        direction: "LONG",
        type: "PULLBACK",
        severity: "HIGH",
        title: "VWAP Reclaim",
        rationale: "Price reclaimed VWAP.",
        generatedAt: "2026-09-12T00:00:00.000Z",
      },
    ],
    score: 88,
    grade: "A",
    rationale: "High edge candidate.",
    calculatedAt: "2026-09-12T00:00:00.000Z",
    confidence: 80,
    trendStrength: 70,
    signalStrength: 75,
  };

  return { ...base, ...overrides };
}

describe("ConditionEvaluator", () => {
  it("matches all configured metric and result conditions", () => {
    const conditionSet: ConditionSet = {
      id: "high-edge",
      name: "High Edge",
      matchMode: "all",
      enabled: true,
      conditions: [
        { id: "score", label: "Score", source: "result", field: "score", operator: "gte", value: 80 },
        { id: "rvol", label: "RVol", source: "metrics", field: "relativeVolume", operator: "gte", value: 1.3 },
      ],
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };

    const match = new ConditionEvaluator().evaluate(conditionSet, result());

    expect(match.matched).toBe(true);
    expect(match.symbol).toBe("ES");
  });

  it("fails when a required condition is not satisfied", () => {
    const conditionSet: ConditionSet = {
      id: "too-strict",
      name: "Too Strict",
      matchMode: "all",
      enabled: true,
      conditions: [
        { id: "score", label: "Score", source: "result", field: "score", operator: "gte", value: 95 },
      ],
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };

    expect(new ConditionEvaluator().evaluate(conditionSet, result()).matched).toBe(false);
  });

  it("can match generated scanner signal titles", () => {
    const conditionSet: ConditionSet = {
      id: "vwap-reclaim",
      name: "VWAP Reclaim",
      matchMode: "all",
      enabled: true,
      conditions: [
        { id: "signal", label: "Signal", source: "signal", field: "title", operator: "contains", value: "VWAP Reclaim" },
      ],
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };

    expect(new ConditionEvaluator().evaluate(conditionSet, result()).matched).toBe(true);
  });

  it("can match normalized external study values", () => {
    const store = new StudyValueStore();
    store.set({
      instrument: { symbol: "ES", assetClass: "FUTURES" },
      values: [
        {
          studyId: "opening-drive",
          field: "isLong",
          value: true,
          receivedAt: "2026-09-12T00:00:00.000Z",
        },
      ],
      receivedAt: "2026-09-12T00:00:00.000Z",
    });

    const conditionSet: ConditionSet = {
      id: "study-confirmed",
      name: "Study Confirmed",
      matchMode: "all",
      enabled: true,
      conditions: [
        { id: "study", label: "Opening Drive", source: "study", field: "opening-drive.isLong", operator: "eq", value: true },
      ],
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };

    expect(new ConditionEvaluator(store).evaluate(conditionSet, result()).matched).toBe(true);
  });
});
