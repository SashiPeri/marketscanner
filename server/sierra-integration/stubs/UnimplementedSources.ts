import { SierraIntegrationNotImplementedError } from "../errors";
import { getCapability } from "../capabilities";
import { FillScannerCorrelator } from "../sources/FillScannerCorrelator";
import { SierraChartbookSource } from "../sources/SierraChartbookSource";
import { SierraExecutionSource } from "../sources/SierraExecutionSource";
import { SierraFillSource } from "../sources/SierraFillSource";
import { SierraHistoricalTickSource } from "../sources/SierraHistoricalTickSource";
import { SierraReplaySessionSource } from "../sources/SierraReplaySessionSource";
import { SierraTradeTapeSource } from "../sources/SierraTradeTapeSource";
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
  Unsubscribe,
} from "../types";
import { SierraIntegrationFacade, SierraIntegrationDeps } from "../SierraIntegrationFacade";

function notImplemented(goal: Parameters<typeof getCapability>[0]): never {
  const cap = getCapability(goal);
  throw new SierraIntegrationNotImplementedError(goal, cap.transport);
}

export class UnimplementedTradeTapeSource implements SierraTradeTapeSource {
  subscribeCompletedTrades(_symbol: string, _listener: CompletedTradeListener): Unsubscribe {
    notImplemented("completed_trades");
  }

  async getCompletedTrades(_query: CompletedTradeQuery): Promise<CompletedTrade[]> {
    return [];
  }
}

export class UnimplementedHistoricalTickSource implements SierraHistoricalTickSource {
  async *fetchTicks(_query: HistoricalTickQuery): AsyncIterable<HistoricalTick> {
    notImplemented("historical_ticks");
  }
}

export class UnimplementedReplaySessionSource implements SierraReplaySessionSource {
  async listSessions(): Promise<ReplaySessionDescriptor[]> {
    return [];
  }

  async getStatus(_sessionId: string): Promise<ReplaySessionStatus | undefined> {
    return undefined;
  }
}

export class UnimplementedChartbookSource implements SierraChartbookSource {
  async listChartbooks(): Promise<ChartbookInfo[]> {
    return [];
  }

  async getChartbook(_id: string): Promise<ChartbookInfo | undefined> {
    return undefined;
  }
}

export class UnimplementedExecutionSource implements SierraExecutionSource {
  async importExecutions(_source: ImportSource): Promise<ImportResult> {
    notImplemented("executions");
  }

  async listExecutions(_query?: ExecutionQuery): Promise<ExecutionRecord[]> {
    return [];
  }
}

export class UnimplementedFillSource implements SierraFillSource {
  async importFills(_source: ImportSource): Promise<ImportResult> {
    notImplemented("fills");
  }

  async listFills(_query?: FillQuery): Promise<FillRecord[]> {
    return [];
  }

  subscribeFills(_listener: FillListener): Unsubscribe {
    notImplemented("fills");
  }
}

export class UnimplementedFillScannerCorrelator implements FillScannerCorrelator {
  async correlate(
    fill: FillRecord,
    _options?: CorrelateOptions,
  ): Promise<FillScannerCorrelation> {
    return {
      fill,
      matched: false,
      matchMethod: "unmatched",
      confidence: 0,
      notes: "FillScannerCorrelator not implemented — wire FillScannerCorrelatorImpl",
    };
  }

  async correlateBatch(
    fills: FillRecord[],
    options?: CorrelateOptions,
  ): Promise<FillScannerCorrelation[]> {
    return Promise.all(fills.map((f) => this.correlate(f, options)));
  }
}

/** Factory: discoverable stubs (empty lists) + throws on import/subscribe/fetch. */
export function createUnimplementedSierraIntegration(): SierraIntegrationFacade {
  const deps: SierraIntegrationDeps = {
    tradeTape: new UnimplementedTradeTapeSource(),
    historicalTicks: new UnimplementedHistoricalTickSource(),
    replaySessions: new UnimplementedReplaySessionSource(),
    chartbooks: new UnimplementedChartbookSource(),
    executions: new UnimplementedExecutionSource(),
    fills: new UnimplementedFillSource(),
    correlator: new UnimplementedFillScannerCorrelator(),
  };
  return new SierraIntegrationFacade(deps);
}
