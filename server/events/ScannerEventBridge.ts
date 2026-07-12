import { Logger } from "../logging";
import { MetricsService } from "../metrics";
import { PersistenceBundle } from "../persistence";
import { ScannerEngine } from "../scanner";
import { EventBus } from "./EventBus";

/**
 * Bridges ScannerEngine result notifications into the application EventBus.
 * Keeps the scanner engine decoupled from downstream consumers.
 */
export class ScannerEventBridge {
  private unsubscriber: (() => void) | null = null;

  constructor(
    private readonly scannerEngine: ScannerEngine,
    private readonly eventBus: EventBus,
    private readonly persistence: PersistenceBundle,
    private readonly metrics: MetricsService,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.unsubscriber = this.scannerEngine.onResult((result) => {
      const start = performance.now();
      this.eventBus.publish("scanner:result", result);
      this.persistence.marketSnapshots.save(result.snapshot);

      for (const signal of result.signals) {
        this.persistence.signals.save(signal);
      }

      this.metrics.recordTick();
      this.metrics.recordScannerLatency(performance.now() - start);
    });

    this.logger.info("Scanner event bridge started");
  }

  stop(): void {
    this.unsubscriber?.();
    this.unsubscriber = null;
    this.logger.info("Scanner event bridge stopped");
  }
}
