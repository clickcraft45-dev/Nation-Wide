import type { NextConfig } from "next";

// VAL-3: standard security headers, applied to every page response via next.config.ts's
// headers() (works fine here since these are static, not per-request). The Content-Security-Policy
// itself is NOT here — it needs a fresh nonce per request to allow Next.js's own inline
// RSC-hydration bootstrap scripts (script-src 'self' with no nonce/unsafe-inline blocks them
// outright, breaking client hydration site-wide), so it's generated per-request in middleware.ts
// instead. See middleware.ts for the full CSP and why.
const SECURITY_HEADERS = [
  // Belt-and-suspenders with the CSP's frame-ancestors (set in middleware.ts) — X-Frame-Options
  // is the older header some clients still only respect.
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
  // Produces a minimal apps/frontend/.next/standalone/ tree with only the node_modules this app
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
