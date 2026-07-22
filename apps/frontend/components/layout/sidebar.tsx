"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, X } from "lucide-react";
import type { NavItem } from "@/lib/nav-config";
import { cn } from "@/lib/utils/cn";

export function Sidebar({
  items,
  mobileOpen,
  onCloseMobile,
}: {
  items: NavItem[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  const content = (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <Package className="h-4 w-4 text-white" aria-hidden />
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground-active">
          NationWide
        </span>
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="ml-auto text-sidebar-foreground hover:text-sidebar-foreground-active lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 px-2 py-2">
        {items.map((item) => {
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
                  ? "bg-sidebar-accent text-sidebar-foreground-active"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground-active",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-hidden
          />
          <aside className="relative flex h-full w-60 flex-col bg-sidebar-bg shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
