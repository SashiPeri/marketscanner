import { SierraIntegrationGoal, SourceCapability } from "./types";

/**
 * Locked task → transport recommendations.
 * Concrete adapters flip `supported` to true when wired.
 */
export const SIERRA_INTEGRATION_CAPABILITIES: readonly SourceCapability[] = [
  {
    goal: "completed_trades",
    transport: "dtc",
    secondaryTransport: "historical_files",
    supported: false,
    notes:
      "Primary: DTC live TradeUpdate into ScannerEngine. Secondary: historical files / ACSIL for tape backfill.",
  },
  {
    goal: "historical_ticks",
    transport: "dtc",
    secondaryTransport: "historical_files",
    supported: false,
    notes:
      "Primary: DTC Historical Price Data for remote Node, or exported tick files for bulk offline. ACSIL arrays when an in-SC bridge exists.",
  },
  {
    goal: "replay_sessions",
    transport: "acsil",
    secondaryTransport: "historical_files",
    supported: false,
    notes:
      "Replay clock lives in Sierra. Observe via ACSIL (+ optional DTC market data during replay). Do not drive SC replay from Node in this phase.",
  },
  {
    goal: "chartbook",
    transport: "acsil",
    supported: false,
    notes:
      "Chartbooks are Sierra-internal. Expose metadata through an ACSIL/IPC bridge or manual export. DTC does not provide layout.",
  },
  {
    goal: "executions",
    transport: "trade_activity_log",
    secondaryTransport: "acsil",
    supported: false,
    notes:
      "Trade Activity Log is the system of record for orders/executions. ACSIL order APIs cover the live trading day only.",
  },
  {
    goal: "fills",
    transport: "trade_activity_log",
    secondaryTransport: "dtc",
    supported: false,
    notes:
      "Import fills from TAL exports. Use DTC fill messages for realtime when trade-connected.",
  },
  {
    goal: "fill_scanner_correlation",
    transport: "trade_activity_log",
    supported: false,
    notes:
      "App-side correlator joins fills to ScannerEngine / persisted snapshots by symbol and time window (optional trade id).",
  },
] as const;

export function getCapability(goal: SierraIntegrationGoal): SourceCapability {
  const found = SIERRA_INTEGRATION_CAPABILITIES.find((c) => c.goal === goal);
  if (!found) {
    throw new Error(`Unknown Sierra integration goal: ${goal}`);
  }
  return { ...found };
}

export function listCapabilities(): SourceCapability[] {
  return SIERRA_INTEGRATION_CAPABILITIES.map((c) => ({ ...c }));
}
