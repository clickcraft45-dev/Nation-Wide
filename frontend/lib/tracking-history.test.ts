import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrackingHistory,
  readTrackingHistory,
  rememberTrackingNumber,
} from "./tracking-history";

const KEY = "nw.tracking-history";

beforeEach(() => {
  window.localStorage.clear();
});

describe("tracking history", () => {
  it("returns an empty list when nothing has been stored", () => {
    expect(readTrackingHistory()).toEqual([]);
  });

  it("puts the most recent lookup first and never duplicates one", () => {
    rememberTrackingNumber("NW-1");
    rememberTrackingNumber("NW-2");
    expect(rememberTrackingNumber("NW-1")).toEqual(["NW-1", "NW-2"]);
    expect(readTrackingHistory()).toEqual(["NW-1", "NW-2"]);
  });

  it("keeps only the eight most recent", () => {
    for (let i = 1; i <= 10; i++) rememberTrackingNumber(`NW-${i}`);
    const history = readTrackingHistory();
    expect(history).toHaveLength(8);
    expect(history[0]).toBe("NW-10");
    expect(history).not.toContain("NW-1");
  });

  it("ignores blank input rather than storing it", () => {
    rememberTrackingNumber("NW-1");
    expect(rememberTrackingNumber("   ")).toEqual(["NW-1"]);
  });

  // The key is public and anything could have written it — a page must render, not throw.
  it("survives junk in storage", () => {
    window.localStorage.setItem(KEY, "not json at all");
    expect(readTrackingHistory()).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify({ nope: true }));
    expect(readTrackingHistory()).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify(["NW-1", 42, null, "", "NW-2"]));
    expect(readTrackingHistory()).toEqual(["NW-1", "NW-2"]);
  });

  it("clears", () => {
    rememberTrackingNumber("NW-1");
    clearTrackingHistory();
    expect(readTrackingHistory()).toEqual([]);
  });
});
