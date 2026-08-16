import type { NextConfig } from "next";

// The backend origin the frontend actually calls (api-client's fetch calls, and the
// company-logo <img> tags served from the backend's /uploads/*) — needed in the CSP below so
// connect-src/img-src aren't wide open. Falls back to the same dev default api-client itself
// uses (lib/api-client/index.ts) when the env var isn't set at build time.
const API_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
).origin;

// VAL-3: a site-wide CSP + standard security headers, applied to every page response — the app
// previously only scoped a CSP to Next's image-optimizer responses (see images.contentSecurityPolicy
// below), leaving the actual HTML pages with no CSP at all. This is defense-in-depth: the codebase
// has no known XSS sink today, but this contains the blast radius if one is ever introduced.
// Deliberately strict (no 'unsafe-inline'/'unsafe-eval' on script-src) — loosen only for a
// concretely-needed origin, not preemptively.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      // Tailwind/Radix ship some styling via inline <style>/style attributes at runtime —
      // style-src is a far lower-value XSS target than script-src, so 'unsafe-inline' here is a
      // pragmatic allowance, not a blanket one.
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: ${API_ORIGIN}`,
      "font-src 'self' data:",
      `connect-src 'self' ${API_ORIGIN}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  // Belt-and-suspenders with frame-ancestors above — X-Frame-Options is the older header some
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
