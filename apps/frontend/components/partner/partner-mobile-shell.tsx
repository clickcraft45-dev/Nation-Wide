"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { AuthUserDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { PARTNER_NAV_ITEMS, findNavItemForPath } from "@/lib/nav-config";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

// A dedicated mobile-first shell for the field partner portal — not a responsive collapse of
// the admin DashboardShell/Sidebar. Single scrollable column, a slim top bar, and a fixed
// bottom tab bar sized for a thumb, so the whole app stays operable one-handed outdoors.
export function PartnerMobileShell({
  user,
  children,
}: {
  user: AuthUserDto;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const current = findNavItemForPath(pathname, PARTNER_NAV_ITEMS);

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  /* fixed inset-0, not h-screen: the shell owns the viewport, so it must not be able to be
     pushed around by anything else in the document. As a normal-flow h-screen box it could —
     while a Recharts chart mounted on /admin/dashboard the subtree briefly measured taller than
     the viewport, the document picked up ~2200px of scroll range, and it never gave it back (a
     full viewport resize did not clear it). There is no scrollbar to warn you, but one wheel
     gesture over the sidebar then drags the whole UI off screen and leaves a blank white page.
     Out of flow, <body> has no in-flow content and the document is exactly the viewport, always.
     It also sidesteps 100vh being wrong on mobile browsers with a retracting URL bar. */
  return (
    <div className="app-ambient fixed inset-0 flex flex-col overflow-hidden">
      <header className="glass-chrome z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/40 px-4">
        <Avatar label={user.email} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {current?.label ?? "Pickup Partner"}
          </p>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Log out"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">{children}</main>

      <nav
        aria-label="Primary"
        className="glass-chrome fixed inset-x-0 bottom-0 z-20 flex border-t border-white/40 pb-[env(safe-area-inset-bottom)]"
      >
        {PARTNER_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
