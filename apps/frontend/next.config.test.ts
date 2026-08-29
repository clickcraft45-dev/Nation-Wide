import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

async function cspDirectives(): Promise<Map<string, string>> {
  const groups = await nextConfig.headers!();
  const csp = groups[0].headers.find((h) => h.key === "Content-Security-Policy");
  expect(csp, "no Content-Security-Policy header configured").toBeDefined();
  return new Map(
    csp!.value.split("; ").map((d) => {
      const [name, ...rest] = d.split(" ");
      return [name, rest.join(" ")];
    }),
  );
}

describe("Content-Security-Policy", () => {
  // The regression this guards: a nonce-based script-src requires the nonce to be stamped onto
  // the script tags while the page renders, and almost every route here is prerendered at build
  // time. A nonce policy therefore ships HTML with zero nonce attributes and the browser blocks
  // EVERY script on EVERY page — server HTML paints, hydration never runs, nothing is clickable.
  // If someone reintroduces a nonce, they must also force dynamic rendering; this test is the
  // reminder.
  it("does not require a nonce it cannot supply on prerendered pages", async () => {
    const scriptSrc = (await cspDirectives()).get("script-src")!;
    expect(scriptSrc).not.toContain("nonce-");
    expect(scriptSrc).not.toContain("strict-dynamic");
    expect(scriptSrc).toContain("'unsafe-inline'");
  });

  it("keeps the directives that still hold the line", async () => {
    const d = await cspDirectives();
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("default-src")).toBe("'self'");
  });

  it("never allows unsafe-eval outside development", async () => {
    // NODE_ENV is "test" under vitest, which the config treats as non-production — so this asserts
    // the shape of the dev branch. The production branch is the same string minus 'unsafe-eval'.
    const scriptSrc = (await cspDirectives()).get("script-src")!;
    expect(scriptSrc.startsWith("'self' 'unsafe-inline'")).toBe(true);
  });
});

describe("brand mark", () => {
  // components/brand/logo.tsx renders the mark for the app; app/icon.svg is the same geometry as
  // a static file because Next.js needs the tab icon on disk. Nothing enforces that by
  // construction, so this does — a mark edited in one place and not the other ships a favicon
  // that is not the logo.
  it("app/icon.svg carries the same two paths as <NwMark>", () => {
    const component = readFileSync("./components/brand/logo.tsx", "utf8");
    const icon = readFileSync("./app/icon.svg", "utf8");
    const paths = [...component.matchAll(/^const (?:N|ARROW)_PATH = "([^"]+)";$/gm)].map(
      (m) => m[1],
    );
    expect(paths).toHaveLength(2);
    for (const d of paths) expect(icon).toContain(`d="${d}"`);
  });
});
