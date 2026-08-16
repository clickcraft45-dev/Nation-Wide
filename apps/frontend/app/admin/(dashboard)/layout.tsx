"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ADMIN_NAV_ITEMS, ADMIN_NAV_GROUPS, filterNavGroupsByRole } from "@/lib/nav-config";
import { Loader2 } from "lucide-react";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (user.role === "CUSTOMER") {
      // A customer account trying to reach the manager area — send them to their own
      // dashboard rather than the login form they're already past.
      router.replace("/dashboard");
    } else if (user.role === "PICKUP_PARTNER") {
      // Pickup Partners get their own tablet-friendly dashboard/nav tree, not a filtered
      // slice of the admin shell — the two audiences see almost none of the same screens.
      router.replace("/partner/dashboard");
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || !user || user.role === "CUSTOMER" || user.role === "PICKUP_PARTNER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const visibleNavItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );
  const visibleNavGroups = filterNavGroupsByRole(ADMIN_NAV_GROUPS, user.role);

  return (
    <DashboardShell
      user={user}
      items={visibleNavItems}
      groups={visibleNavGroups}
      profileHref="/admin/settings"
    >
      {children}
    </DashboardShell>
  );
}
