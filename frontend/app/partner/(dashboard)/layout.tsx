"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { PartnerMobileShell } from "@/components/partner/partner-mobile-shell";
import { Loader2 } from "lucide-react";

// Pickup Partner (field executive) shell — mobile-first, purpose-built for a phone in the
// field (see PartnerMobileShell). A wholly separate route tree from /admin, not a role-filtered
// slice of it (see admin/(dashboard)/layout.tsx's own redirect back here for PICKUP_PARTNER
// accounts), and deliberately not the same DashboardShell/Sidebar the desktop admin panel uses.
export default function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (user.role === "CUSTOMER") {
      router.replace("/dashboard");
    } else if (user.role === "STAFF" || user.role === "ADMIN") {
      router.replace("/admin/dashboard");
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || !user || user.role !== "PICKUP_PARTNER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <PartnerMobileShell user={user}>{children}</PartnerMobileShell>;
}
