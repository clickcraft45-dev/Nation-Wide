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
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pricing Management</h1>
        <p className="text-sm text-muted-foreground">
          Rates, providers, and destination countries the pricing engine uses to quote customers.
          Changes here take effect immediately — no deployment required.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Pricing sections">
        {PRICING_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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
