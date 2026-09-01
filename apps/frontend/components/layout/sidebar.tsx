"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import type { NavItem, NavGroup } from "@/lib/nav-config";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

// ICON RAIL, one level. Each icon IS a link to that section's primary page — a real <Link>, so it
// works everywhere with no JS: keyboard tab, screen reader, and touch (where hover doesn't exist,
// tapping just navigates). Hovering it on a pointer device also lifts out a glass card with the
// rest of that section, so nothing beyond the primary page is more than one hover away.
//
// This replaced a second, always-open w-72 panel that just repeated the same section list right
// next to the flyout showing the same thing — same content, twice, permanently, for every one of
// its ~20 items across ~7 sections, one of which is almost always empty screen below a single row
// (see the "System" section, two items in a panel sized for a dozen). The flyout already does
// this job on demand; the permanent panel was a second way to look at the same fact, so it's
// gone. Cuts the whole mobile drawer with it — a 64px rail is thin enough to just stay on screen
// at every width, so there is no overlay/backdrop/hamburger to keep in sync any more.
//
// ONE LOGO. It lives at the top of the rail and nowhere else.
//
// The palette is the existing --sidebar-* tokens (near-black surface, #27272a hairlines, zinc-400
// idle text, white active text) — the same brand panel as the login screen and marketing hero.
//
// MOTION: plain CSS transitions on opacity/transform/colour, paired with
// `motion-reduce:transition-none`, matching the reduced-motion contract in globals.css.

/** The soft-spring curve from the reference, shared so every row moves as one gesture. */
const SPRING = "cubic-bezier(0.25, 1.1, 0.4, 1)";
const MOTION = "duration-500 ease-out motion-reduce:transition-none";
const springStyle = { transitionTimingFunction: SPRING };

/** Idle to hover/active row treatment, identical for rail icons and flyout rows. */
function rowTone(isActive: boolean) {
  return isActive
    ? "bg-sidebar-accent text-sidebar-foreground-active"
    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground-active";
}

/**
 * The hover/focus card for a rail section: a black glass pane that lifts out over the page with
 * the whole section inside it.
 *
 * Pure CSS — `group-hover`/`group-focus-within` on the wrapping cell, no state and no positioning
 * library. The gap between icon and card is `pl-3` ON THE FLYOUT rather than margin on the card,
 * so the strip the pointer crosses is still inside the hovered element and the card cannot
 * flicker shut halfway across it. `visibility` is transitioned alongside opacity because it
 * interpolates discretely: the card stays rendered for the whole fade-out, then goes untabbable.
 */
function SectionFlyout({
  section,
  icon: Icon,
  pathname,
}: {
  section: NavGroup;
  icon: LucideIcon;
  pathname: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none invisible absolute left-full top-0 z-50 translate-x-1 pl-3 opacity-0 transition-[opacity,transform,visibility]",
        MOTION,
        "group-hover:pointer-events-auto group-hover:visible group-hover:translate-x-0 group-hover:opacity-100",
        "group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100",
      )}
      style={springStyle}
    >
      <div className="glass-dark relative w-64 overflow-hidden rounded-2xl border p-2">
        {/* The sheen: one soft highlight raking across the top edge. This is the thing that reads
            as glass — without it a translucent pane is just a flat grey rectangle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-32 bg-[radial-gradient(65%_100%_at_25%_100%,rgba(255,255,255,0.18),transparent_70%)]"
        />

        <div className="relative flex items-center gap-2 px-2 pb-2 pt-1">
          <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground-active" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground-active">
            {section.label}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums text-sidebar-foreground">
            {section.items.length}
          </span>
        </div>

        <div className="relative mb-1 h-px bg-white/10" aria-hidden />

        {/* Capped rather than unbounded: a section near the foot of the rail would otherwise run
            its card off the bottom of a short viewport. */}
        <div className="relative max-h-[60vh] space-y-0.5 overflow-y-auto">
          {section.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  rowTone(isActive),
                )}
              >
                <ItemIcon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ items, groups }: { items: NavItem[]; groups?: NavGroup[] }) {
  const pathname = usePathname();

  // Callers without a grouped IA still render through the same markup, as one section.
  const sections: NavGroup[] = groups ?? [{ label: "Menu", items }];

  const activeSection = Math.max(
    0,
    sections.findIndex((section) =>
      section.items.some(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      ),
    ),
  );

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar-bg px-3 py-3">
      <Link
        href={sections[0]?.items[0]?.href ?? "/"}
        className="mb-1 flex h-10 w-10 items-center justify-center"
        aria-label="NationWide Logistics home"
      >
        <Logo variant="icon" size="sm" />
      </Link>

      <div className="my-1 h-px w-8 shrink-0 bg-sidebar-border" aria-hidden />

      {sections.map((section, index) => {
        const Icon = section.icon ?? section.items[0].icon;
        const isActive = index === activeSection;
        return (
          // The cell, not the link, is the hover group: the flyout has to live outside the
          // <Link> (it holds its own links) while still being revealed by pointing at it.
          <div key={section.label} className="group relative shrink-0">
            <Link
              href={section.items[0].href}
              // No `title`: the flyout IS the label now, and a native tooltip would fade up over
              // the top of it a half-second later.
              aria-label={section.label}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                MOTION,
                rowTone(isActive),
              )}
              style={springStyle}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </Link>
            <SectionFlyout section={section} icon={Icon} pathname={pathname} />
          </div>
        );
      })}
    </div>
  );
}
