import * as fs from "fs";
import * as path from "path";
import { DEFAULT_SCANNER_CONFIG, ScannerConfig, SCANNER_CONFIG_VERSION } from "./ScannerConfig";

/**
 * Persists a single ScannerConfig document.
 * Uses the same pattern as JsonTradeRepository — write-through, read from memory.
 */
export class ScannerConfigRepository {
  private config: ScannerConfig;
  private readonly filePath: string;
  private readonly mode: "memory" | "json";

  constructor(dataDir: string, mode: "memory" | "json") {
    this.mode = mode;
    this.filePath = path.join(dataDir, "scanner-config.json");
    this.config = { ...DEFAULT_SCANNER_CONFIG };
  }

  load(): void {
    if (this.mode !== "json") return;

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as ScannerConfig;
        // Forward-compat: if version changed, merge defaults
        if (parsed.version === SCANNER_CONFIG_VERSION) {
          this.config = parsed;
        } else {
          this.config = {
            ...DEFAULT_SCANNER_CONFIG,
            universe: parsed.universe ?? DEFAULT_SCANNER_CONFIG.universe,
            selectedIndicators:
              parsed.selectedIndicators ?? DEFAULT_SCANNER_CONFIG.selectedIndicators,
            filters: parsed.filters ?? DEFAULT_SCANNER_CONFIG.filters,
            sort: parsed.sort ?? DEFAULT_SCANNER_CONFIG.sort,
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // If file is corrupt, fall back to defaults
      this.config = { ...DEFAULT_SCANNER_CONFIG };
    }
  }

  get(): ScannerConfig {
    return this.config;
  }

  save(config: ScannerConfig): void {
    this.config = { ...config, version: SCANNER_CONFIG_VERSION, updatedAt: new Date().toISOString() };
    if (this.mode === "json") {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), "utf-8");
      } catch {
        // Non-fatal: config updates lost on restart if write fails
      }
    }
  }

  patch(partial: Partial<Omit<ScannerConfig, "version" | "updatedAt">>): ScannerConfig {
    const updated: ScannerConfig = {
      ...this.config,
      ...partial,
      version: SCANNER_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
    };
    this.save(updated);
    return updated;
  }
}
