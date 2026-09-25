import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadCustomSymbols, saveCustomSymbols } from "../customSymbolsStore";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "symbols-"));
}

describe("customSymbolsStore", () => {
  it("round-trips symbols upper-cased and deduplicated", () => {
    const dir = tmpDir();
    saveCustomSymbols(dir, ["esz25", " ESZ25 ", "nqz25", "", 42 as unknown as string]);
    expect(loadCustomSymbols(dir)).toEqual(["ESZ25", "NQZ25"]);
  });

  it("returns empty when nothing was saved", () => {
    expect(loadCustomSymbols(tmpDir())).toEqual([]);
  });

  it("returns empty on corrupt file instead of throwing", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "custom-symbols.json"), "{not json");
    expect(loadCustomSymbols(dir)).toEqual([]);
  });
});
