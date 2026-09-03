import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/site";

// The complete set of publicly indexable routes — kept in step with app/robots.ts by hand, since
// there are five of them and every other route in the app is behind auth.
const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/track", changeFrequency: "monthly", priority: 0.8 },
  { path: "/shipping-guidelines", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
