import { listCapabilities } from "./capabilities";
import { FillScannerCorrelator } from "./sources/FillScannerCorrelator";
import { SierraChartbookSource } from "./sources/SierraChartbookSource";
import { SierraExecutionSource } from "./sources/SierraExecutionSource";
import { SierraFillSource } from "./sources/SierraFillSource";
import { SierraHistoricalTickSource } from "./sources/SierraHistoricalTickSource";
import { SierraReplaySessionSource } from "./sources/SierraReplaySessionSource";
import { SierraTradeTapeSource } from "./sources/SierraTradeTapeSource";
import {
  CompletedTrade,
  CompletedTradeListener,
  CompletedTradeQuery,
  CorrelateOptions,
  ExecutionQuery,
  ExecutionRecord,
  FillListener,
  FillQuery,
  FillRecord,
  FillScannerCorrelation,
  HistoricalTick,
  HistoricalTickQuery,
  ImportResult,
  ImportSource,
  ReplaySessionDescriptor,
  ReplaySessionStatus,
  ChartbookInfo,
  SourceCapability,
  Unsubscribe,
} from "./types";

export interface SierraIntegrationDeps {
  tradeTape: SierraTradeTapeSource;
  historicalTicks: SierraHistoricalTickSource;
  replaySessions: SierraReplaySessionSource;
  chartbooks: SierraChartbookSource;
  executions: SierraExecutionSource;
  fills: SierraFillSource;
  correlator: FillScannerCorrelator;
}

/**
 * Facade over Sierra integration sources.
 * Concrete adapters are injected; use createUnimplementedSierraIntegration() until then.
 * Not registered in createServices until a real adapter exists.
 */
export class SierraIntegrationFacade {
  constructor(private readonly deps: SierraIntegrationDeps) {}

  describeCapabilities(): SourceCapability[] {
    return listCapabilities();
  }

  subscribeCompletedTrades(symbol: string, listener: CompletedTradeListener): Unsubscribe {
    return this.deps.tradeTape.subscribeCompletedTrades(symbol, listener);
  }

  getCompletedTrades(query: CompletedTradeQuery): Promise<CompletedTrade[]> {
    return this.deps.tradeTape.getCompletedTrades(query);
  }

  fetchTicks(query: HistoricalTickQuery): AsyncIterable<HistoricalTick> {
    return this.deps.historicalTicks.fetchTicks(query);
  }

  listReplaySessions(): Promise<ReplaySessionDescriptor[]> {
    return this.deps.replaySessions.listSessions();
  }

  getReplayStatus(sessionId: string): Promise<ReplaySessionStatus | undefined> {
    return this.deps.replaySessions.getStatus(sessionId);
  }

  listChartbooks(): Promise<ChartbookInfo[]> {
    return this.deps.chartbooks.listChartbooks();
  }

  getChartbook(id: string): Promise<ChartbookInfo | undefined> {
    return this.deps.chartbooks.getChartbook(id);
  }

  importExecutions(source: ImportSource): Promise<ImportResult> {
    return this.deps.executions.importExecutions(source);
  }

  listExecutions(query?: ExecutionQuery): Promise<ExecutionRecord[]> {
    return this.deps.executions.listExecutions(query);
  }

  importFills(source: ImportSource): Promise<ImportResult> {
    return this.deps.fills.importFills(source);
  }

  listFills(query?: FillQuery): Promise<FillRecord[]> {
    return this.deps.fills.listFills(query);
  }

  subscribeFills(listener: FillListener): Unsubscribe {
    return this.deps.fills.subscribeFills(listener);
  }

  correlateFill(
    fill: FillRecord,
    options?: CorrelateOptions,
  ): Promise<FillScannerCorrelation> {
    return this.deps.correlator.correlate(fill, options);
  }

  correlateFills(
    fills: FillRecord[],
    options?: CorrelateOptions,
  ): Promise<FillScannerCorrelation[]> {
    return this.deps.correlator.correlateBatch(fills, options);
  }
}
