import { ScoredScannerResult } from "./types";

export type ConditionSource = "snapshot" | "metrics" | "result" | "signal" | "study";
export type ConditionOperator =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "between"
  | "in"
  | "contains"
  | "exists";

export interface ScannerCondition {
  /** Stable condition identifier for updates and audit logs. */
  id: string;
  /** Display label explaining the condition to the user. */
  label: string;
  /** Source object inside the normalized scanner result. */
  source: ConditionSource;
  /** Dot-path field to evaluate, such as metrics.relativeVolume or grade. */
  field: string;
  /** Comparison operator applied to the resolved value. */
  operator: ConditionOperator;
  /** Expected value for single-value operators. */
  value?: number | string | boolean;
  /** Lower inclusive bound for between comparisons. */
  min?: number;
  /** Upper inclusive bound for between comparisons. */
  max?: number;
  /** Allowed values for in comparisons. */
  values?: Array<number | string | boolean>;
}

export interface ConditionSet {
  /** Stable condition-set identifier. */
  id: string;
  /** User-facing name, such as A+ Breakout Candidates. */
  name: string;
  /** Whether all conditions must pass or any one condition can pass. */
  matchMode: "all" | "any";
  /** Active rule conditions evaluated against every scanner result. */
  conditions: ScannerCondition[];
  /** Whether this condition set is active in scans. */
  enabled: boolean;
  /** Creation timestamp, expressed as ISO-8601. */
  createdAt: string;
  /** Last update timestamp, expressed as ISO-8601. */
  updatedAt: string;
}

export interface ConditionMatch {
  /** Condition that was evaluated. */
  conditionId: string;
  /** Whether this condition passed for the scanner result. */
  passed: boolean;
  /** Actual value resolved from the scanner result. */
  actualValue?: unknown;
  /** Human-readable reason when evaluation cannot be completed. */
  reason?: string;
}

export interface ConditionSetMatch {
  /** Condition set that produced this match result. */
  conditionSetId: string;
  /** Condition set display name. */
  conditionSetName: string;
  /** Instrument symbol evaluated. */
  symbol: string;
  /** Whether the full condition set matched. */
  matched: boolean;
  /** Per-condition evaluation details. */
  conditions: ConditionMatch[];
  /** Scanner result used for evaluation. */
  result: ScoredScannerResult;
  /** Evaluation timestamp, expressed as ISO-8601. */
  evaluatedAt: string;
}

export const DEFAULT_CONDITION_SET: ConditionSet = {
  id: "default-high-edge",
  name: "High Edge Futures Candidates",
  matchMode: "all",
  enabled: true,
  conditions: [
    {
      id: "score-gte-80",
      label: "Score at least 80",
      source: "result",
      field: "score",
      operator: "gte",
      value: 80,
    },
    {
      id: "rvol-gte-1-3",
      label: "Relative volume at least 1.3x",
      source: "metrics",
      field: "relativeVolume",
      operator: "gte",
      value: 1.3,
    },
    {
      id: "avoid-f-grade",
      label: "Grade is not F",
      source: "result",
      field: "grade",
      operator: "neq",
      value: "F",
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
