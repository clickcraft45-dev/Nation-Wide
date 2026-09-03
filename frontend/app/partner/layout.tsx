import type { Metadata } from "next";

// Same reasoning as app/admin/layout.tsx: the pickup partner area is private and its route-group
// layout is a client component, so the title template and noindex live in this server layout.
export const metadata: Metadata = {
  title: {
    default: "NationWide Partner",
    template: "%s · NationWide Partner",
  },
  robots: { index: false, follow: false },
};

export default function PartnerSectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
