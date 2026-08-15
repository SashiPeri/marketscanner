import {
  FillListener,
  FillQuery,
  FillRecord,
  ImportResult,
  ImportSource,
  Unsubscribe,
} from "../types";

/**
 * Account fills (our trades).
 * Recommended transport: Trade Activity Log (history); DTC fill stream (realtime).
 */
export interface SierraFillSource {
  importFills(source: ImportSource): Promise<ImportResult>;

  listFills(query?: FillQuery): Promise<FillRecord[]>;

  subscribeFills(listener: FillListener): Unsubscribe;
}
