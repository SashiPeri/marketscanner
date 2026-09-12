import { StudyValueSnapshot } from "../types";

export class StudyValueStore {
  private readonly snapshots = new Map<string, StudyValueSnapshot>();

  set(snapshot: StudyValueSnapshot): void {
    this.snapshots.set(snapshot.instrument.symbol.toUpperCase(), snapshot);
  }

  get(symbol: string): StudyValueSnapshot | undefined {
    return this.snapshots.get(symbol.toUpperCase());
  }

  getValue(symbol: string, studyId: string, field: string): unknown {
    const snapshot = this.get(symbol);
    return snapshot?.values.find(
      (value) => value.studyId === studyId && value.field === field,
    )?.value;
  }

  getAll(): StudyValueSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  size(): number {
    return this.snapshots.size;
  }
}
