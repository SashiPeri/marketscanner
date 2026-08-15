import { ChartbookInfo } from "../types";

/**
 * Chartbook / chart metadata.
 * Recommended transport: ACSIL or chartbook file metadata bridge.
 */
export interface SierraChartbookSource {
  listChartbooks(): Promise<ChartbookInfo[]>;

  getChartbook(id: string): Promise<ChartbookInfo | undefined>;
}
