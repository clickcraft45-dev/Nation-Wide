import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// All three role shells (admin, customer, pickup partner) own the viewport and scroll their own
// <main>. The root element must stay OUT of normal flow.
//
// The regression this guards is invisible until you hit it: with a normal-flow `h-screen` root,
// a Recharts chart mounting on /admin/dashboard briefly measured taller than the viewport, the
// document picked up ~2200px of scroll range, and it never released it — not even after a full
// viewport resize. No scrollbar appears, so nothing looks wrong; then one wheel gesture over the
// sidebar drags the entire UI off screen and leaves a blank white page. `fixed inset-0` makes
// that structurally impossible, because <body> is then left with no in-flow content at all.
const SHELLS = [
  "components/layout/dashboard-shell.tsx",
  "components/customer/customer-mobile-shell.tsx",
  "components/partner/partner-mobile-shell.tsx",
];

describe("app shells stay pinned to the viewport", () => {
  it.each(SHELLS)("%s roots at fixed inset-0, never h-screen", (file) => {
    const src = readFileSync(file, "utf8");
    const root = src.match(/return \(\r?\n\s*<div className="([^"]+)"/);
    expect(root, `no root <div className> found in ${file}`).not.toBeNull();
    expect(root![1]).toContain("fixed inset-0");
    expect(root![1]).toContain("overflow-hidden");
    expect(root![1]).not.toContain("h-screen");
  });

  it.each(SHELLS)("%s still gives its <main> the scrolling", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/<main className="[^"]*overflow-y-auto/);
  });
});
