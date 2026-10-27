import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/site";

// Only the marketing surface and the tracking *form* are public. Everything else is either
// behind auth or is a per-shipment page whose URL contains a real tracking number — indexing
// those would publish customer shipment status to search engines.
//
// Note the trailing slash on "/track/": it blocks /track/NW-26-000123 while leaving the /track
// lookup form itself indexable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/partner",
        "/dashboard",
        "/orders",
        "/profile",
        "/quote",
        "/quotes",
        "/pickup-request",
        "/tracking",
        "/bills",
        "/documents",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/track/",
        // Private links carrying a token: a B2B portal and a feedback form.
        "/b2b",
        "/feedback",
        "/offline.html",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
