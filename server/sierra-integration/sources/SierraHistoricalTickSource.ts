import { HistoricalTick, HistoricalTickQuery } from "../types";

/**
 * Historical tick / fine-grained price data.
 * Recommended transport: DTC Historical Price Data or exported historical files.
 */
export interface SierraHistoricalTickSource {
  /**
   * Stream ticks for a time range. Adapters may page internally.
   * Consuming the iterable fully is required to release resources.
   */
  fetchTicks(query: HistoricalTickQuery): AsyncIterable<HistoricalTick>;
}
