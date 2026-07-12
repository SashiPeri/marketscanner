export type AppEnvironment = "development" | "production" | "testing";
export type MarketProviderType = "mock" | "sierra";
export type PersistenceMode = "memory" | "json";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SierraConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ServerConfig {
  port: number;
  nodeEnv: AppEnvironment;
  geminiApiKey?: string;
  marketProvider: MarketProviderType;
  sierra: SierraConnectionConfig;
  logLevel: LogLevel;
  persistenceMode: PersistenceMode;
  dataDir: string;
  version: string;
  buildTimestamp: string;
  batchIntervalMs: number;
  gracefulShutdownTimeoutMs: number;
}

export const CONFIG_DEFAULTS = {
  port: 3000,
  nodeEnv: "development" as AppEnvironment,
  marketProvider: "mock" as MarketProviderType,
  sierraHost: "127.0.0.1",
  sierraPort: 11099,
  logLevel: "info" as LogLevel,
  persistenceMode: "json" as PersistenceMode,
  dataDir: "data",
  version: "0.0.0",
  batchIntervalMs: 50,
  gracefulShutdownTimeoutMs: 10_000,
} as const;
