import * as fs from "node:fs";
import * as path from "node:path";

const FILE_NAME = "custom-symbols.json";

function normalise(symbols: unknown): string[] {
  if (!Array.isArray(symbols)) return [];
  const cleaned = symbols
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toUpperCase().trim())
    .filter((s) => s.length > 0);
  return [...new Set(cleaned)];
}

/**
 * Provider-level symbol subscriptions (sierra customSymbols) persist here so
 * a restart keeps the same products. Watchlist display scoping lives in
 * watchlist.json; this file is what the feed subscribes to.
 * Best-effort: in-memory state stays authoritative, disk is a restore aid.
 */
export function loadCustomSymbols(dataDir: string): string[] {
  try {
    return normalise(JSON.parse(fs.readFileSync(path.join(dataDir, FILE_NAME), "utf8")));
  } catch {
    return [];
  }
}

export function saveCustomSymbols(dataDir: string, symbols: string[]): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, FILE_NAME), JSON.stringify(normalise(symbols), null, 2));
  } catch {
    // ignore — in-memory state stays authoritative
  }
}
