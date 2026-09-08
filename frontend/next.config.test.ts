import { existsSync, readFileSync } from "node:fs";
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
  // The mark is now the supplied artwork rather than paths drawn in the component, so the old
  // "do the two copies of the geometry match" check no longer applies. What can still silently
  // break is the wiring: a renamed or missing file leaves every logo on the site as a broken
  // image, which no type or lint error catches.
  it("every asset the Logo component points at exists on disk", () => {
    const assets = readFileSync("./lib/constants/assets.ts", "utf8");
    const paths = [...assets.matchAll(/"(\/assets\/logo\/[^"]+)"/g)].map((m) => m[1]);

    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(existsSync(`./public${p}`)).toBe(true);
      // A space in a static path has to be percent-encoded by every consumer, and one of them
      // eventually forgets. The supplied file was "logo-without bg.png" for exactly this reason.
      expect(p).not.toContain(" ");
    }
  });

  it("the tab icons Next.js serves from app/ are present", () => {
    for (const f of ["./app/favicon.ico", "./app/apple-icon.png"]) {
      expect(existsSync(f)).toBe(true);
    }
  });
});
