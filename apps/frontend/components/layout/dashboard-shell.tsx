"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AuthUserDto } from "@nationwide/shared-types";
import { findNavItemForPath, type NavItem, type NavGroup } from "@/lib/nav-config";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * The oversized ghosted numeral in the bottom-right corner — the section's index in the nav,
 * zero-padded. Purely a wayfinding cue, so it is aria-hidden and never intercepts a click; the
 * page's real identity is its <h1> and the topbar breadcrumb.
 *
 * Outlined with -webkit-text-stroke rather than a stack of SVG glyphs: it is supported
 * everywhere the rest of this app's glass already is, and a browser without it simply renders
 * the transparent fill, which degrades to invisible rather than to wrong.
 */
function PageNumeral({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const current = findNavItemForPath(pathname, items);
  if (!current) return null;
  const index = items.indexOf(current) + 1;

  return (
    <span
      aria-hidden
      className="pointer-events-none fixed bottom-2 right-6 z-0 select-none font-semibold leading-none text-transparent text-[6rem] [-webkit-text-stroke:1.5px_var(--border)] lg:text-[8rem] lg:[-webkit-text-stroke:2px_var(--border)]"
    >
      {String(index).padStart(2, "0")}
    </span>
  );
}

export function DashboardShell({
  user,
  items,
  groups,
  profileHref,
  children,
}: {
  user: AuthUserDto;
  /** Flat list — drives topbar breadcrumb matching regardless of how the sidebar groups them. */
  items: NavItem[];
  /** Optional grouped rendering for the sidebar (e.g. admin's Overview/Operations/Finance/…).
   * Omit for a flat, unlabeled list (customer nav is short enough not to need sections). */
  groups?: NavGroup[];
  profileHref: string;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /* fixed inset-0, not h-screen: the shell owns the viewport, so it must not be able to be
     pushed around by anything else in the document. As a normal-flow h-screen box it could —
     while a Recharts chart mounted on /admin/dashboard the subtree briefly measured taller than
     the viewport, the document picked up ~2200px of scroll range, and it never gave it back (a
     full viewport resize did not clear it). There is no scrollbar to warn you, but one wheel
     gesture over the sidebar then drags the whole UI off screen and leaves a blank white page.
     Out of flow, <body> has no in-flow content and the document is exactly the viewport, always.
     It also sidesteps 100vh being wrong on mobile browsers with a retracting URL bar. */
  return (
    <div className="app-ambient fixed inset-0 flex overflow-hidden">
      <Sidebar
        items={items}
        groups={groups}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          items={items}
          profileHref={profileHref}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        {/* The numeral is fixed, not absolute: `position: absolute` inside a scroll container
            resolves against the full scrollable box, so it would sit at the bottom of a long
            table rather than staying in the corner. */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
          <PageNumeral items={items} />
        </main>
      </div>
    </div>
  );
}
