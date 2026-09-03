"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav-config";
import { cn } from "@/lib/utils/cn";

/**
 * The floating glass dock at the foot of the customer and pickup-partner apps.
 *
 * One component, both shells: the two carried byte-identical tab-bar markup before this, which
 * is how they drifted into being styled separately in the first place.
 *
 * WHY IT FLOATS. An edge-to-edge bar welded to the bottom of the viewport reads as a browser
 * chrome strip; a rounded pane inset from all three edges reads as an object sitting above the
 * page, which is what makes the blur legible — you can see the content passing underneath it.
 * That is the whole trick behind the iOS app docks this is modelled on.
 *
 * The material is `.glass-raised`, not a new one: it is the app's existing "floating above
 * arbitrary page content" surface (thicker, more opaque, heavier blur than `.glass`), and it
 * already degrades to a solid white panel under prefers-reduced-transparency and in browsers
 * without backdrop-filter. A bespoke dock style would have had to re-earn all of that.
 */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    // The wrapper spans the viewport so the dock can centre itself, but stays click-through —
    // without pointer-events-none it would swallow taps on the content either side of the pill.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      // The dock sits above the home indicator rather than under it, so the gesture bar never
      // overlaps a tab target.
    >
      <nav
        aria-label="Primary"
        className="glass-raised pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 rounded-[1.75rem] p-1.5"
      >
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1 py-2 text-[11px] font-medium",
                "transition-[background-color,color,transform] duration-200 ease-out motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? // A filled pill, the same active idiom as the admin rail — inverted, because
                    // there the rail is dark and here the dock is light.
                    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)]"
                  : "text-muted-foreground active:scale-95 active:bg-white/50 motion-reduce:active:scale-100",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
