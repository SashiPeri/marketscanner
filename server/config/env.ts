import { CONFIG_DEFAULTS, AppEnvironment, LogLevel, ServerConfig } from "./types";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? CONFIG_DEFAULTS.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigValidationError(`Invalid PORT: ${raw}`);
  }
  return port;
}

function parseNodeEnv(raw: string | undefined): AppEnvironment {
  const value = (raw ?? CONFIG_DEFAULTS.nodeEnv).toLowerCase();
  if (value === "production" || value === "development" || value === "testing") {
    return value;
  }
  throw new ConfigValidationError(`Invalid NODE_ENV: ${raw}`);
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? CONFIG_DEFAULTS.logLevel).toLowerCase();
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new ConfigValidationError(`Invalid LOG_LEVEL: ${raw}`);
}

function parsePersistenceMode(raw: string | undefined): ServerConfig["persistenceMode"] {
  const value = (raw ?? CONFIG_DEFAULTS.persistenceMode).toLowerCase();
  if (value === "memory" || value === "json") return value;
  throw new ConfigValidationError(`Invalid PERSISTENCE_MODE: ${raw}`);
}

/** Validate and normalize environment variables. Fails fast on startup. */
export function loadConfig(): ServerConfig {
  const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
  const marketProviderRaw = (process.env.MARKET_PROVIDER || CONFIG_DEFAULTS.marketProvider).toLowerCase();

  if (nodeEnv === "production" && marketProviderRaw === "mock") {
    console.warn("[config] MARKET_PROVIDER=mock in production — intended for staging only");
  }

  if (nodeEnv === "testing") {
    return {
      port: parsePort(process.env.PORT),
      nodeEnv,
      geminiApiKey: process.env.GEMINI_API_KEY,
      marketProvider: "mock",
      sierra: {
        host: process.env.SIERRA_HOST || CONFIG_DEFAULTS.sierraHost,
        port: Number(process.env.SIERRA_PORT || CONFIG_DEFAULTS.sierraPort),
        username: process.env.SIERRA_USERNAME,
        password: process.env.SIERRA_PASSWORD,
      },
      logLevel: "error",
      persistenceMode: "memory",
      dataDir: process.env.DATA_DIR || "data/test",
      version: process.env.APP_VERSION || CONFIG_DEFAULTS.version,
      buildTimestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
      batchIntervalMs: CONFIG_DEFAULTS.batchIntervalMs,
      gracefulShutdownTimeoutMs: 5_000,
    };
  }

  const sierraPort = Number(process.env.SIERRA_PORT || CONFIG_DEFAULTS.sierraPort);
  if (!Number.isInteger(sierraPort) || sierraPort < 1 || sierraPort > 65535) {
    throw new ConfigValidationError(`Invalid SIERRA_PORT: ${process.env.SIERRA_PORT}`);
  }

  return {
    port: parsePort(process.env.PORT),
    nodeEnv,
    geminiApiKey: process.env.GEMINI_API_KEY,
    marketProvider: marketProviderRaw === "sierra" ? "sierra" : "mock",
    sierra: {
      host: process.env.SIERRA_HOST || CONFIG_DEFAULTS.sierraHost,
      port: sierraPort,
      username: process.env.SIERRA_USERNAME,
      password: process.env.SIERRA_PASSWORD,
    },
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    persistenceMode: parsePersistenceMode(process.env.PERSISTENCE_MODE),
    dataDir: process.env.DATA_DIR || CONFIG_DEFAULTS.dataDir,
    version: process.env.APP_VERSION || CONFIG_DEFAULTS.version,
    buildTimestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    batchIntervalMs: Number(process.env.BATCH_INTERVAL_MS || CONFIG_DEFAULTS.batchIntervalMs),
    gracefulShutdownTimeoutMs: Number(
      process.env.SHUTDOWN_TIMEOUT_MS || CONFIG_DEFAULTS.gracefulShutdownTimeoutMs,
    ),
  };
}
