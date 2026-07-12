import { randomUUID } from "crypto";
import { LogContext, Logger, LogLevel } from "./Logger";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface JsonLoggerOptions {
  component: string;
  minLevel?: LogLevel;
  correlationId?: string;
  output?: (line: string) => void;
}

/**
 * Structured JSON logger — no third-party framework required.
 * Each line is a self-contained JSON object with timestamp and correlation ID.
 */
export class JsonLogger implements Logger {
  private readonly baseContext: LogContext;
  private readonly minLevel: LogLevel;
  private readonly output: (line: string) => void;

  constructor(options: JsonLoggerOptions) {
    this.baseContext = {
      component: options.component,
      correlationId: options.correlationId ?? randomUUID(),
    };
    this.minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.output = options.output ?? ((line) => {
      const parsed = JSON.parse(line) as { level: LogLevel };
      if (parsed.level === "error") console.error(line);
      else if (parsed.level === "warn") console.warn(line);
      else console.log(line);
    });
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  child(context: LogContext): Logger {
    return new JsonLogger({
      component: (context.component as string) ?? (this.baseContext.component as string),
      minLevel: this.minLevel,
      correlationId: (context.correlationId as string) ?? (this.baseContext.correlationId as string),
      output: this.output,
    });
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.baseContext,
      ...context,
    };

    this.output(JSON.stringify(entry));
  }
}

export function createLogger(component: string, correlationId?: string): Logger {
  return new JsonLogger({ component, correlationId });
}

/** Process-wide root logger used during bootstrap before DI is available. */
export const rootLogger = createLogger("app");
