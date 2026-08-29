"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { NavItem, NavGroup } from "@/lib/nav-config";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

// Dark Deep Navy nav rail, per the approved reference design — a solid Logistics Blue pill marks
// the active item, light blue-gray for inactive labels/icons. Deep Navy here is the same brand
// panel used on the marketing hero and login screen (see globals.css --sidebar-* tokens).
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
  // Fall back to a single unlabeled group so callers without a grouped IA (customer nav) still
  // render through the same list markup.
  const renderedGroups: NavGroup[] = groups ?? [{ label: "", items }];

  const content = (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <Logo variant="reverse" size="sm" className="min-w-0" />
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="ml-auto text-sidebar-foreground hover:text-sidebar-foreground-active lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {renderedGroups.map((group) => (
          <div key={group.label || "default"}>
            {group.label && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
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
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-white text-[#0b0b0c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_6px_16px_-8px_rgba(0,0,0,0.6)]"
                        : "text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground-active",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="glass-dark hidden w-60 shrink-0 flex-col border-r lg:flex">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden
          />
          <aside className="glass-dark relative flex h-full w-60 flex-col border-r">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
