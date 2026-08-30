"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pin, PinOff, X } from "lucide-react";
import type { NavItem, NavGroup } from "@/lib/nav-config";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

// Dark Deep Navy nav rail, per the approved reference design — a solid Logistics Blue pill marks
// the active item, light blue-gray for inactive labels/icons. Deep Navy here is the same brand
// panel used on the marketing hero and login screen (see globals.css --sidebar-* tokens).
//
// MOTION: every transition here is plain CSS on width/max-width/opacity/transform — no animation
// library, and nothing animates a property that triggers layout on each frame except the rail's
// own width, which changes only on an explicit click. Labels collapse via `max-w-0` rather than
// being unmounted so they stay in the accessibility tree (and so the text can animate at all —
// there is nothing to tween between a node and no node). Everything pairs with
// `motion-reduce:transition-none`, matching the reduced-motion contract the rest of the app
// already honours in globals.css.

const RAIL_WIDTH = "w-[4.5rem]";
const PANEL_WIDTH = "w-60";

/** Shared easing/duration so the rail, its labels and the drawer all move as one gesture. */
const MOTION = "duration-300 ease-out motion-reduce:transition-none";

export function Sidebar({
  items,
  groups,
  mobileOpen,
  onCloseMobile,
}: {
  items: NavItem[];
  groups?: NavGroup[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  // The rail is closed by default and opens on hover; the footer button PINS it open so it stops
  // collapsing when the pointer leaves. Two booleans rather than one tri-state because that is
  // exactly what they are — a preference and a transient pointer/focus state — and only the
  // preference is a choice worth remembering.
  //
  // ponytail: session-only, deliberately not persisted. The shell layout stays mounted across
  // client-side navigation, so the choice survives everywhere except a hard reload. Remembering
  // it across reloads means an external store (localStorage cannot be read during render without
  // a hydration mismatch) — reach for useSyncExternalStore if that reset ever actually annoys.
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pointerOpen, setPointerOpen] = useState(false);
  const collapsed = !pinnedOpen && !pointerOpen;

  // Fall back to a single unlabeled group so callers without a grouped IA (customer nav) still
  // render through the same list markup.
  const renderedGroups: NavGroup[] = groups ?? [{ label: "", items }];

  // `isCollapsed` is a parameter, not the state, because the mobile drawer renders the same
  // markup and is always full width — collapsing is a desktop-rail affordance only.
  const content = (isCollapsed: boolean) => (
    <>
      <div className="flex h-14 shrink-0 items-center overflow-hidden px-4">
        <Logo variant="reverse" size="sm" className="min-w-0 shrink-0" />
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="ml-auto text-sidebar-foreground transition-colors hover:text-sidebar-foreground-active lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2 py-3"
      >
        {renderedGroups.map((group) => (
          <div key={group.label || "default"}>
            {group.label && (
              <p
                className={cn(
                  "overflow-hidden whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-all",
                  MOTION,
                  isCollapsed ? "max-h-0 opacity-0" : "max-h-4 pb-1.5 opacity-100",
                )}
              >
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    aria-current={isActive ? "page" : undefined}
                    // Native tooltip rather than a popover component — the rail is icon-only when
                    // collapsed and the label has to stay recoverable by pointer as well as by
                    // screen reader.
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "group/nav flex items-center overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      MOTION,
                      isActive
                        ? "bg-white text-[#0b0b0c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_6px_16px_-8px_rgba(0,0,0,0.6)]"
                        : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-white/10 hover:text-sidebar-foreground-active motion-reduce:hover:translate-x-0",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        MOTION,
                        !isActive && "group-hover/nav:scale-110 motion-reduce:group-hover/nav:scale-100",
                      )}
                      aria-hidden
                    />
                    {/* border-box means max-w-0 clips the padding too, so the collapsed row has
                        no phantom gap after the icon — hence pl-3 here instead of a flex gap. */}
                    <span
                      className={cn(
                        "overflow-hidden whitespace-nowrap pl-3 transition-[max-width,opacity]",
                        MOTION,
                        isCollapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Desktop-only: the drawer is dismissed with its own X, not collapsed to a rail. */}
      <div className="hidden shrink-0 border-t border-sidebar-border p-2 lg:block">
        <button
          onClick={() => setPinnedOpen((previous) => !previous)}
          aria-pressed={pinnedOpen}
          aria-label={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
          title={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
          className={cn(
            "flex w-full items-center overflow-hidden rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-sidebar-foreground-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            MOTION,
          )}
        >
          {pinnedOpen ? (
            <PinOff className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Pin className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap pl-3 transition-[max-width,opacity]",
              MOTION,
              isCollapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
            )}
          >
            {pinnedOpen ? "Unpin" : "Pin open"}
          </span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail. The spacer below is what the page layout actually reserves, and it only
          widens when the rail is PINNED — so opening on hover floats the panel over the content
          instead of reflowing the whole dashboard every time the pointer crosses the edge. */}
      <div
        className={cn(
          "relative hidden shrink-0 transition-[width] lg:block",
          MOTION,
          pinnedOpen ? PANEL_WIDTH : RAIL_WIDTH,
        )}
      >
        <aside
          // Focus opens it as well as hover: tabbing into a collapsed rail has to reveal the
          // labels, or keyboard users navigate a column of unlabeled icons.
          onMouseEnter={() => setPointerOpen(true)}
          onMouseLeave={() => setPointerOpen(false)}
          onFocus={() => setPointerOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPointerOpen(false);
          }}
          className={cn(
            "glass-dark absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r shadow-xl transition-[width]",
            MOTION,
            collapsed ? RAIL_WIDTH : PANEL_WIDTH,
          )}
        >
          {content(collapsed)}
        </aside>
      </div>

      {/* Mobile drawer — mounted at all times so it can animate out as well as in; an unmounted
          panel can only ever pop. `invisible` keeps it off the tab order while closed, which
          `pointer-events-none` alone would not do. Transitioning visibility is what makes the
          close animation visible at all: it interpolates discretely, so the panel stays rendered
          for the full duration and only then goes hidden. */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-[visibility] lg:hidden",
          MOTION,
          !mobileOpen && "pointer-events-none invisible",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity",
            MOTION,
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={onCloseMobile}
          aria-hidden
        />
        <aside
          className={cn(
            "glass-dark relative flex h-full w-60 flex-col border-r transition-transform",
            MOTION,
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {content(false)}
        </aside>
      </div>
    </>
  );
}
