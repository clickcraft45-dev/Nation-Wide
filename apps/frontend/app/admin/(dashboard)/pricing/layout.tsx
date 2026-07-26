"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/state/auth-context";

// Rate cards directly control company margin — the first ADMIN-only (not STAFF+ADMIN) section
// of the admin panel. The parent admin layout already guarantees an authenticated STAFF/ADMIN
// user by the time this renders, so only the ADMIN/STAFF split needs handling here.
export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user && user.role === "STAFF") {
      router.replace("/admin/dashboard");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role === "STAFF") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <>{children}</>;
}
