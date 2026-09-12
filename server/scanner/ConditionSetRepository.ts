import * as fs from "fs";
import * as path from "path";
import { ConditionSet, DEFAULT_CONDITION_SET } from "./ConditionSet";

export class ConditionSetRepository {
  private conditionSets: ConditionSet[] = [{ ...DEFAULT_CONDITION_SET }];
  private readonly filePath: string;

  constructor(
    dataDir: string,
    private readonly mode: "memory" | "json",
  ) {
    this.filePath = path.join(dataDir, "scanner-condition-sets.json");
  }

  load(): void {
    if (this.mode !== "json") return;

    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as ConditionSet[];
      if (Array.isArray(parsed)) this.conditionSets = parsed;
    } catch {
      this.conditionSets = [{ ...DEFAULT_CONDITION_SET }];
    }
  }

  getAll(): ConditionSet[] {
    return this.conditionSets.map((conditionSet) => ({ ...conditionSet }));
  }

  replaceAll(conditionSets: ConditionSet[]): ConditionSet[] {
    const now = new Date().toISOString();
    this.conditionSets = conditionSets.map((conditionSet) => ({
      ...conditionSet,
      createdAt: conditionSet.createdAt || now,
      updatedAt: now,
    }));
    this.flush();
    return this.getAll();
  }

  private flush(): void {
    if (this.mode !== "json") return;

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.conditionSets, null, 2), "utf-8");
    } catch {
      // Non-fatal: conditions remain active in memory for this process.
    }
  }
}
