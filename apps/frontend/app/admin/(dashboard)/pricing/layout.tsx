"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { cn } from "@/lib/utils/cn";

const PRICING_NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/pricing/dashboard" },
  { label: "Providers", href: "/admin/pricing/providers" },
  { label: "Countries", href: "/admin/pricing/countries" },
  { label: "Zones", href: "/admin/pricing/zones" },
  { label: "Rate Management", href: "/admin/pricing/rate-management" },
  { label: "Fuel & PSS", href: "/admin/pricing/fuel-pss" },
  { label: "PDF Generator", href: "/admin/pricing/pdf-generator" },
  { label: "Rate History", href: "/admin/pricing/rate-history" },
] as const;

// Rate cards directly control company margin — the first ADMIN-only (not STAFF+ADMIN) section
// of the admin panel. The parent admin layout already guarantees an authenticated STAFF/ADMIN
// user by the time this renders, so only the ADMIN/STAFF split needs handling here.
//
// The 8 pricing sections (Dashboard/Providers/Countries/Zones/Rate Management/Fuel & PSS/PDF
// Generator/Rate History) are real routes, not local tab state — each loads only its own slice
// of data. The sidebar itself has no sub-item support (see lib/nav-config.ts), so this secondary
// nav bar is what makes them feel like dedicated sections.
export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">Commercial control</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pricing Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Rates, providers, and destination countries the pricing engine uses to quote customers.
          Changes here take effect immediately — no deployment required.
        </p>
        </div>
        <div className="glass-rim rounded-2xl bg-white/55 px-4 py-3 text-sm text-muted-foreground">Rate changes are logged for audit.</div>
      </div>

      <nav className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5" aria-label="Pricing sections">
        {PRICING_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 motion-reduce:transition-none",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_8px_18px_-12px_rgba(9,9,11,0.65)]"
                  : "text-muted-foreground hover:bg-white/55 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
