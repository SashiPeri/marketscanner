import {
  ExecutionQuery,
  ExecutionRecord,
  ImportResult,
  ImportSource,
} from "../types";

/**
 * Order-level execution / activity records.
 * Recommended transport: Trade Activity Log export/import.
 */
export interface SierraExecutionSource {
  importExecutions(source: ImportSource): Promise<ImportResult>;

  listExecutions(query?: ExecutionQuery): Promise<ExecutionRecord[]>;
}
