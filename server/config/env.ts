export interface ServerConfig {
  port: number;
  nodeEnv: string;
  geminiApiKey?: string;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT || 3000),
    nodeEnv: process.env.NODE_ENV || "development",
    geminiApiKey: process.env.GEMINI_API_KEY,
  };
}
