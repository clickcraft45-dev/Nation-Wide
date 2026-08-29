"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu, X } from "lucide-react";
import type { AuthUserDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { CUSTOMER_NAV_ITEMS, CUSTOMER_TAB_ITEMS } from "@/lib/nav-config";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

// The customer app's dedicated mobile-first shell — a slim top bar, a 4-item bottom tab bar
// (Home/Ship/Track/Profile, per the approved design), and a hamburger drawer for the rest of the
// real nav (My Orders, My Quotes) that doesn't fit in the tab bar. Mirrors the pattern already
// established by PartnerMobileShell, not a responsive collapse of the admin DashboardShell.
export function CustomerMobileShell({
  user,
  children,
}: {
  user: AuthUserDto;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Logo variant="horizontal" size="sm" className="mx-auto" />
        <button
          aria-label="Notifications"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">{children}</main>

      <nav
        aria-label="Primary"
        className="glass-chrome fixed inset-x-0 bottom-0 z-20 flex border-t border-white/40 pb-[env(safe-area-inset-bottom)]"
      >
        {CUSTOMER_TAB_ITEMS.map((item) => {
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

      {drawerOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="glass-raised relative flex h-full w-72 max-w-[80vw] flex-col">
            <div className="flex h-14 items-center gap-2 border-b border-border px-4">
              <Logo variant="horizontal" size="sm" />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Full navigation" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
              {CUSTOMER_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                      isActive
                        ? "bg-info-bg text-brand-navy"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <p className="truncate px-3 text-xs text-muted-foreground">{user.email}</p>
              <button
                onClick={handleLogout}
                className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger-bg"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
