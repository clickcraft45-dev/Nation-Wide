"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/state/auth-context";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role === "CUSTOMER")) {
      router.replace("/admin/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role === "CUSTOMER") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex gap-6 text-sm font-medium">
            <Link href="/admin/shipments">Shipments</Link>
            <Link href="/admin/integrations">Integrations</Link>
            <Link href="/admin/audit-logs">Audit Log</Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <span>
              {user.email} ({user.role})
            </span>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => router.replace("/admin/login"));
              }}
              className="font-medium text-zinc-900 dark:text-zinc-50"
            >
              Log out
            </button>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
