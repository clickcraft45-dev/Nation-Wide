import type { NextConfig } from "next";

// The backend origin the frontend actually calls — api-client's fetch calls. Kept explicit in
// the CSP so connect-src isn't wide open. Same fallback api-client itself uses
// (lib/api-client/index.ts).
const API_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
).origin;

// The company logo is an <img> pointing at a presigned URL on the private S3 bucket, which is a
// different origin from the API. Narrow to the bucket's own host rather than allowing all of
// S3: set NEXT_PUBLIC_S3_ORIGIN to e.g. https://nationwide-logistics-s3.s3.ap-south-1.amazonaws.com.
const S3_ORIGIN = process.env.NEXT_PUBLIC_S3_ORIGIN ?? "";

// Cloudflare injects its Web Analytics beacon into every HTML response when the feature is on
// for the zone. It is added at the edge, AFTER Next.js renders, so nothing in this repo requests
// it and no amount of app-side code review reveals why it is there. Without these two entries the
// browser blocks it on every page load and the console fills with CSP violations.
// Remove them only if Web Analytics is turned off in the Cloudflare dashboard.
const CF_BEACON_SCRIPT = "https://static.cloudflareinsights.com";
const CF_BEACON_REPORT = "https://cloudflareinsights.com";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Site-wide Content-Security-Policy.
 *
 * WHY `script-src` CARRIES 'unsafe-inline' AND NOT A NONCE — this is a deliberate, tested
 * trade-off, not an oversight:
 *
 * Next's App Router emits inline bootstrap scripts on every page (`self.__next_f.push(…)` flight
 * chunks and the `self.__next_r` request-id tag). They have no stable hash, so the only two
 * policies a browser will actually run them under are a per-request nonce or 'unsafe-inline'.
 *
 * A nonce has to be stamped onto the script tags while the page renders, which means the page has
 * to be rendered per request. Almost every route in this app is statically prerendered at build
 * time (see `next build`'s ○ markers) — there is no per-request render to stamp anything onto. A
 * middleware that minted a fresh nonce per request and set it in the CSP header therefore shipped
 * HTML containing zero nonce attributes, and the browser blocked every script on every page: the
 * server HTML painted, hydration never ran, and nothing in the app was clickable. Keeping the
 * nonce would mean forcing all ~60 routes to dynamic rendering — giving up static prerendering on
 * the public marketing pages to protect inline scripts that React never generates from user input.
 *
 * So: 'unsafe-inline' for script-src, and everything else stays tight. What still holds the line —
 * 'self' means no third-party script origin can load at all; object-src 'none' kills plugin
 * vectors; base-uri 'self' blocks <base> hijacking of every relative script URL; form-action
 * 'self' stops injected forms exfiltrating to another origin; frame-ancestors 'none' blocks
 * clickjacking. There is no dangerouslySetInnerHTML anywhere in this app, so React's own escaping
 * is the primary defence against the injection 'unsafe-inline' would otherwise let through.
 */
const CSP = [
  "default-src 'self'",
  // Dev additionally needs 'unsafe-eval' for Turbopack's HMR runtime; production never gets it.
  `script-src 'self' 'unsafe-inline' ${CF_BEACON_SCRIPT}${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind/Radix ship some styling via inline <style>/style attributes at runtime. style-src is
  // a far lower-value target than script-src, so 'unsafe-inline' here is uncontroversial.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${API_ORIGIN} ${S3_ORIGIN}`.trim(),
  "font-src 'self' data:",
  // 'self' also covers the same-origin ws:// upgrade Turbopack's HMR socket uses in dev.
  // The beacon POSTs its measurements to cloudflareinsights.com/cdn-cgi/rum — allowing the
  // script without this just moves the CSP violation from load time to report time.
  `connect-src 'self' ${API_ORIGIN} ${CF_BEACON_REPORT}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-suspenders with the CSP's frame-ancestors — X-Frame-Options is the older header some
  // clients still only respect.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No `preload` — that's a one-way submission to browsers' built-in preload lists, a bigger
  // commitment than this config should make on its own before the production domain is settled.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Produces a minimal frontend/.next/standalone/ tree with only the node_modules this app
  // actually needs traced in — what the Dockerfile's runtime stage copies, instead of shipping
  // the full monorepo node_modules into the production image.
  output: "standalone",
  images: {
    // The marketing page's placeholder art (hero/services/about/world-map) is hand-authored SVG
    // under our own /public — not user-uploaded — so this is the documented safe case for
    // enabling SVG through next/image. Swapping in real photography later just means pointing
    // lib/constants/assets.ts at .webp/.avif files; this stays on for any future local SVG mark.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
