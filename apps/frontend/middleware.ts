import { NextRequest, NextResponse } from "next/server";

// VAL-3 follow-up: the CSP previously lived as a static header in next.config.ts with
// `script-src 'self'` and no 'unsafe-inline'/nonce. That unconditionally blocks the inline
// <script> tags Next.js itself emits to stream RSC payloads for hydration — confirmed via actual
// browser console output (CSP violation -> React hydration error #412) in both `next dev` and a
// production `next build && next start`, meaning no client interactivity worked at all. Next.js
// has built-in support for this: generate a per-request nonce, put it in the CSP's script-src,
// and Next automatically applies that same nonce to its own bootstrap/hydration scripts.
// See https://nextjs.org/docs/app/guides/content-security-policy.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeaderValue = buildCsp(nonce);

  // Threaded through as a request header (not just the response) so a Server Component could
  // read it via `headers().get("x-nonce")` if a custom inline <script> is ever added later.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeaderValue);

  return response;
}

function buildCsp(nonce: string) {
  // Same origin resolution next.config.ts's SECURITY_HEADERS used — kept in sync deliberately;
  // see the comment there for why this needs to be the actual backend origin, not a wildcard.
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
  ).origin;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${apiOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const config = {
  matcher: [
    // Excludes static assets/_next internals (a fresh nonce per asset request is pointless and
    // would defeat their caching) and prefetch requests (a differing nonce per soft-navigation
    // prefetch isn't meaningful and would waste work) — the pattern Next.js documents for this.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
