import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Next.js does not run on Workers unmodified: OpenNext compiles the standalone server output into
// a single Worker entry. Defaults are deliberate — no incremental cache or tag cache is wired up
// because every dynamic route here (/quotes/[id], /track/[trackingId], ...) reads live data from
// the API on each request and must never be served stale.
export default defineCloudflareConfig();
