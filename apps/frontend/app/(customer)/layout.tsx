"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CUSTOMER_NAV_ITEMS } from "@/lib/nav-config";
import { Loader2 } from "lucide-react";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/");
    } else if (user.role !== "CUSTOMER") {
      // A staff/admin account trying to reach the customer area — send them to their own
      // dashboard rather than showing a dead end.
      router.replace("/admin/dashboard");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== "CUSTOMER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <DashboardShell user={user} items={CUSTOMER_NAV_ITEMS} profileHref="/profile">
      {children}
    </DashboardShell>
  );
}
