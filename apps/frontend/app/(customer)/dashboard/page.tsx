"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe2, Headset, Package, CalendarClock, MapPin, PackagePlus } from "lucide-react";
import type { OrderDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { apiClient } from "@/lib/api-client";
import { CONTACT_EMAIL } from "@/lib/constants/contact";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Package;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="glass glass-interactive flex flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center active:bg-muted/60"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-bg text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </Link>
  );
}

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<OrderDto[]>("/orders/me")
      .then(setOrders)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening today.</p>
      </div>

      {/* Hero — matches the primary "Get a Quote" / "Track Shipment" actions from the approved
          design; reuses the same search form already used on the marketing landing page. */}
      <div className="rounded-2xl bg-primary p-5 text-white">
        <p className="text-base font-semibold">Track Your Shipment</p>
        <p className="mt-0.5 text-sm text-white/80">Enter your Order ID / Tracking ID</p>
        <div className="on-dark mt-3">
          <TrackingSearchForm
            onSubmit={(trackingNumber) =>
              router.push(`/tracking?tracking=${encodeURIComponent(trackingNumber)}`)
            }
            submitButtonClassName="bg-white text-primary hover:bg-white/90"
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction href="/quote" icon={PackagePlus} label="Get a Quote" />
          {/* Pickup scheduling only exists once a quote is accepted — this is the real entry
              point to that flow, not a standalone "schedule pickup" feature. */}
          <QuickAction href="/quotes" icon={CalendarClock} label="Schedule Pickup" />
          <QuickAction href="/orders" icon={Package} label="My Shipments" />
          {/* No in-app support desk exists yet — a real mailto action rather than a fake page. */}
          <QuickAction href={`mailto:${CONTACT_EMAIL}`} icon={Headset} label="Support" />
        </div>
      </div>

      <Link
        href="/quote"
        className="glass flex items-center gap-4 rounded-2xl p-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-info-bg text-primary">
          <Globe2 className="h-6 w-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Ship Internationally</span>
          <span className="block text-xs text-muted-foreground">To 220+ Countries</span>
        </span>
        <span className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Get Quote
        </span>
      </Link>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent Shipments</h2>
          <Link href="/orders" className="text-xs font-medium text-primary">
            View All
          </Link>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package className="h-8 w-8" aria-hidden />} title="No orders yet" />
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 5).map((order) => {
              const shipment = order.shipments[0];
              return (
                <Link
                  key={order.id}
                  href={
                    shipment
                      ? `/tracking?tracking=${shipment.internalTrackingNumber}`
                      : "/orders"
                  }
                  className="glass glass-interactive flex items-center justify-between rounded-2xl p-3 active:bg-muted/60"
                >
                  <span className="flex items-center gap-2 font-mono text-sm text-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                  </span>
                  <TrackingStatusBadge status={shipment?.currentStatus} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
