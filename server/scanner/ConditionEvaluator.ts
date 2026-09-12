import {
  ConditionMatch,
  ConditionOperator,
  ConditionSet,
  ConditionSetMatch,
  ScannerCondition,
} from "./ConditionSet";
import { StudyValueStore } from "./StudyValueStore";
import { ScoredScannerResult } from "./types";

export class ConditionEvaluator {
  constructor(private readonly studyValueStore?: StudyValueStore) {}

  evaluate(conditionSet: ConditionSet, result: ScoredScannerResult): ConditionSetMatch {
    const conditions = conditionSet.conditions.map((condition) => this.evaluateCondition(condition, result));
    const matched = conditionSet.matchMode === "any"
      ? conditions.some((condition) => condition.passed)
      : conditions.every((condition) => condition.passed);

    return {
      conditionSetId: conditionSet.id,
      conditionSetName: conditionSet.name,
      symbol: result.instrument.symbol,
      matched,
      conditions,
      result,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private evaluateCondition(condition: ScannerCondition, result: ScoredScannerResult): ConditionMatch {
    const actualValue = this.resolveValue(condition, result);

    if (actualValue === undefined) {
      return {
        conditionId: condition.id,
        passed: condition.operator === "exists" ? false : false,
        reason: `Field not available: ${condition.source}.${condition.field}`,
      };
    }

    return {
      conditionId: condition.id,
      passed: this.compare(condition.operator, actualValue, condition),
      actualValue,
    };
  }

  private resolveValue(condition: ScannerCondition, result: ScoredScannerResult): unknown {
    if (condition.source === "signal") {
      return result.signals.map((signal) => signal.title);
    }

    if (condition.source === "study") {
      const [studyId, ...fieldParts] = condition.field.split(".");
      const field = fieldParts.join(".");
      if (!studyId || !field) return undefined;
      return this.studyValueStore?.getValue(result.instrument.symbol, studyId, field);
    }

    const root = condition.source === "snapshot"
      ? result.snapshot
      : condition.source === "metrics"
        ? result.metrics
        : result;

    return condition.field.split(".").reduce<unknown>((current, key) => {
      if (current === null || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, root);
  }

  private compare(operator: ConditionOperator, actual: unknown, condition: ScannerCondition): boolean {
    switch (operator) {
      case "exists":
        return actual !== undefined && actual !== null;
      case "eq":
        return actual === condition.value;
      case "neq":
        return actual !== condition.value;
      case "contains":
        return Array.isArray(actual) && condition.value !== undefined
          ? actual.includes(condition.value)
          : String(actual).includes(String(condition.value));
      case "in":
        return condition.values?.includes(actual as never) ?? false;
      case "between":
        return this.isNumber(actual) && this.isNumber(condition.min) && this.isNumber(condition.max)
          ? actual >= condition.min && actual <= condition.max
          : false;
      case "gt":
        return this.numericCompare(actual, condition.value, (a, b) => a > b);
      case "gte":
        return this.numericCompare(actual, condition.value, (a, b) => a >= b);
      case "lt":
        return this.numericCompare(actual, condition.value, (a, b) => a < b);
      case "lte":
        return this.numericCompare(actual, condition.value, (a, b) => a <= b);
      default:
        return false;
    }
  }

  private numericCompare(
    actual: unknown,
    expected: unknown,
    predicate: (actual: number, expected: number) => boolean,
  ): boolean {
    if (!this.isNumber(actual) || !this.isNumber(expected)) return false;
    return predicate(actual, expected);
  }

  private isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
}
