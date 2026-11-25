import { describe, expect, it } from "vitest";
import { parseTrackingNumbers } from "@nationwide/shared-types";

describe("parseTrackingNumbers", () => {
  it("reads one number per line, in order", () => {
    expect(parseTrackingNumbers("NW-26-00000123\nNW-26-00000124\r\n1Z999AA10123456784")).toEqual([
      "NW-26-00000123",
      "NW-26-00000124",
      "1Z999AA10123456784",
    ]);
  });

  it("accepts commas, tabs and blank lines from a pasted spreadsheet column or email", () => {
    expect(parseTrackingNumbers(" NW-26-1 ,\tNW-26-2;\n\n  NW-26-3  ")).toEqual(["NW-26-1", "NW-26-2", "NW-26-3"]);
  });

  it("drops duplicates case-insensitively and stray quotes", () => {
    expect(parseTrackingNumbers('"nw-26-1"\nNW-26-1\n#NW-26-2.')).toEqual(["nw-26-1", "NW-26-2"]);
  });

  it("is empty for blank input", () => {
    expect(parseTrackingNumbers("  \n ")).toEqual([]);
  });
});
