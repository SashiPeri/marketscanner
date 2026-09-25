import { describe, expect, it } from "vitest";
import { parseAcsilLine } from "../acsilProtocol";

describe("acsilProtocol", () => {
  it("parses trade lines", () => {
    expect(parseAcsilLine('{"t":"trade","sym":"ESZ26-CME","ts":1758784800123,"price":6642.5,"size":3}'))
      .toEqual({ t: "trade", sym: "ESZ26-CME", ts: 1758784800123, price: 6642.5, size: 3 });
  });

  it("normalizes symbols to uppercase", () => {
    expect(parseAcsilLine('{"t":"hello","sym":"esz26-cme"}'))
      .toEqual({ t: "hello", sym: "ESZ26-CME" });
  });

  it("parses partial quotes", () => {
    expect(parseAcsilLine('{"t":"quote","sym":"YMZ26-CBOT","ts":1758784800124,"bid":123.25}'))
      .toEqual({ t: "quote", sym: "YMZ26-CBOT", ts: 1758784800124, bid: 123.25 });
  });

  it("parses depth snapshots", () => {
    expect(parseAcsilLine('{"t":"depth","sym":"ZCZ26-CBOT","ts":1758784800125,"bids":[[500.25,12]],"asks":[[500.5,9]]}'))
      .toEqual({
        t: "depth", sym: "ZCZ26-CBOT", ts: 1758784800125,
        bids: [[500.25, 12]], asks: [[500.5, 9]],
      });
  });

  it("drops everything that is not a plausible market fact", () => {
    const bad = [
      "",
      "not json",
      "[1,2,3]",
      '{"t":"trade","sym":"","ts":1758784800123,"price":1,"size":1}',
      '{"t":"trade","sym":"ES","ts":1758784800123,"price":0,"size":1}',
      '{"t":"trade","sym":"ES","ts":1758784800123,"price":-5,"size":1}',
      '{"t":"trade","sym":"ES","ts":1758784800123,"price":1,"size":0}',
      '{"t":"trade","sym":"ES","ts":99,"price":1,"size":1}',
      '{"t":"quote","sym":"ES","ts":1758784800123}',
      '{"t":"quote","sym":"ES","ts":1758784800123,"bid":0,"ask":-1}',
      '{"t":"depth","sym":"ES","ts":1758784800123,"bids":[],"asks":"nope"}',
      '{"t":"depth","sym":"ES","ts":1758784800123,"bids":[[0,5]],"asks":[]}',
      '{"t":"nonsense","sym":"ES"}',
    ];
    for (const line of bad) {
      expect(parseAcsilLine(line), line).toBeUndefined();
    }
  });
});
