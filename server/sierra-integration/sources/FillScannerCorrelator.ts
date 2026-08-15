import {
  CorrelateOptions,
  FillRecord,
  FillScannerCorrelation,
} from "../types";

/**
 * Joins account fills to scanner state (live and/or persisted).
 * Application-side — not a Sierra protocol.
 */
export interface FillScannerCorrelator {
  correlate(fill: FillRecord, options?: CorrelateOptions): Promise<FillScannerCorrelation>;

  correlateBatch(
    fills: FillRecord[],
    options?: CorrelateOptions,
  ): Promise<FillScannerCorrelation[]>;
}
