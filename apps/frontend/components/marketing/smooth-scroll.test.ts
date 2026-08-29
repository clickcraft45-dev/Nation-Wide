import { describe, expect, it } from "vitest";
import { sameDocumentHash } from "./smooth-scroll";

describe("sameDocumentHash", () => {
  it("takes bare hash links on any page", () => {
    expect(sameDocumentHash("#faqs", "/terms")).toBe("faqs");
  });

  it("takes a route-qualified hash only when already on that route", () => {
    expect(sameDocumentHash("/#services", "/")).toBe("services");
    expect(sameDocumentHash("/#services", "/terms")).toBeNull();
  });

  it("ignores links with no usable hash", () => {
    expect(sameDocumentHash("/quote", "/")).toBeNull();
    expect(sameDocumentHash("/#", "/")).toBeNull();
    expect(sameDocumentHash(null, "/")).toBeNull();
  });
});
