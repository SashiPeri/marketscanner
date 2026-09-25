export type AppEnvironment = "development" | "production" | "testing";
export type MarketProviderType = "mock" | "sierra" | "acsil";
export type PersistenceMode = "memory" | "json";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SierraConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface AcsilBridgeConfig {
  /** Local TCP port the ACSIL study dials into (scanner listens). */
  port: number;
}

export interface ServerConfig {
  port: number;
  nodeEnv: AppEnvironment;
  geminiApiKey?: string;
  marketProvider: MarketProviderType;
  sierra: SierraConnectionConfig;
  acsil: AcsilBridgeConfig;
  logLevel: LogLevel;
  persistenceMode: PersistenceMode;
  dataDir: string;
  version: string;
  buildTimestamp: string;
  batchIntervalMs: number;
  gracefulShutdownTimeoutMs: number;
  /** Maximum number of symbols allowed; overrides tier default when set. */
  maxSymbols?: number;
  /** API key for guarding /api routes; optional, unenforced if absent. */
  apiKey?: string;
}

export const CONFIG_DEFAULTS = {
  port: 3000,
  nodeEnv: "development" as AppEnvironment,
  marketProvider: "mock" as MarketProviderType,
  sierraHost: "127.0.0.1",
  sierraPort: 11099,
  acsilPort: 18199,
  logLevel: "info" as LogLevel,
  persistenceMode: "json" as PersistenceMode,
  dataDir: "data",
  version: "0.0.0",
  batchIntervalMs: 50,
  gracefulShutdownTimeoutMs: 10_000,
} as const;
