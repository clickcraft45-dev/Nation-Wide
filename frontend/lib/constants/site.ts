/**
 * The public origin this deployment serves from. Used for metadataBase, the canonical tag,
 * robots.txt and sitemap.xml — all four need absolute URLs and all four are generated at build
 * time, so this cannot come from a request header.
 *
 * THE FALLBACK IS THE PRODUCTION DOMAIN, NOT LOCALHOST, and that is the whole point of this file.
 *
 * It used to fall back to http://localhost:3004 so `next build` would never fail on a machine
 * without the variable set. A production build that missed the variable then shipped
 * `<link rel="canonical" href="http://localhost:3004">` — which tells Google the real address of
 * every page is one it cannot reach, and is grounds for dropping the site from the index
 * outright. The same value also went into og:url, og:image and the Sitemap directive in
 * robots.txt, so social previews and sitemap submission were broken with it.
 *
 * Failing soft to the real domain is right for this specific value: being wrong about the origin
 * on a developer's machine costs nothing, and being wrong in production costs the search
 * ranking. Local development still gets localhost, because NODE_ENV is "development" there.
 */
const PRODUCTION_URL = "https://www.nationwidelogistics.co";

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Only a dev server may assume localhost. Any other build is treated as production.
  if (process.env.NODE_ENV === "development") return "http://localhost:3004";
  return PRODUCTION_URL;
}

export const SITE_URL = resolveSiteUrl();
