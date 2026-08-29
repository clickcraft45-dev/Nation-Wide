import type { Metadata } from "next";

// The admin console is private. Its route-group layout below is a client component (it gates on
// auth), and client components can't export metadata — so this thin server layout wraps the whole
// /admin subtree and supplies the title template and noindex for every page underneath it.
export const metadata: Metadata = {
  title: {
    default: "NationWide Admin",
    template: "%s · NationWide Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
