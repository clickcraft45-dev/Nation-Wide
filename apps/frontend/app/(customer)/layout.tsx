"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { CustomerMobileShell } from "@/components/customer/customer-mobile-shell";
import { Loader2 } from "lucide-react";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (user.role !== "CUSTOMER") {
      // A staff/admin account trying to reach the customer area — send them to their own
      // dashboard rather than showing a dead end.
      router.replace("/admin/dashboard");
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || !user || user.role !== "CUSTOMER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <CustomerMobileShell user={user}>{children}</CustomerMobileShell>;
}
