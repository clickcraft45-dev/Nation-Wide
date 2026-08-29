// The public origin this deployment serves from. Used for metadataBase, robots.txt and
// sitemap.xml — all three need absolute URLs, and all three are generated at build time, so this
// has to come from the environment rather than from a request header.
//
// Falls back to the dev server's origin so `next build` never fails on a machine without the var
// set; production deployments must set NEXT_PUBLIC_SITE_URL (see docs/ENV_VARS.md).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3004";
