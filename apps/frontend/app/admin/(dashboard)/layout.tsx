"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Loader2 } from "lucide-react";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role === "CUSTOMER")) {
      router.replace("/admin/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role === "CUSTOMER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
