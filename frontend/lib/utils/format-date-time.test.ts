import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format-date-time";

describe("formatDateTime", () => {
  it("shows the date and the IST time", () => {
    // 10:12 UTC is 15:42 IST.
    expect(formatDateTime("2026-10-27T10:12:00Z")).toMatch(/27 Oct 2026.*3:42\s?pm/i);
  });
});
