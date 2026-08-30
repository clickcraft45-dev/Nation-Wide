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
 * IT SITS BEHIND THE CONTENT. `-z-10` only means "behind" relative to a stacking context, so the
 * column below is marked `isolate` to create one: without that the negative index would resolve
 * against the shell root and put the numeral behind the app's own background, i.e. invisible.
 * With it, the numeral is the backmost layer of the page area and every card, table and heading
 * paints over it — a watermark rather than an overlay. It is positioned against that column
 * rather than the viewport because <main> is a scroll container, and how a fixed descendant of
 * one gets clipped is not worth relying on.
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
      className="pointer-events-none absolute -bottom-6 right-4 -z-10 select-none font-semibold leading-none text-transparent text-[8rem] [-webkit-text-stroke:1.5px_var(--border)] lg:text-[13rem] lg:[-webkit-text-stroke:2px_var(--border)]"
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
      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <PageNumeral items={items} />
        <Topbar
          user={user}
          items={items}
          profileHref={profileHref}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
