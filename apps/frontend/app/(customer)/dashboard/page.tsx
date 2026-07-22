"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, MapPin, User as UserIcon } from "lucide-react";
import type { OrderDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { apiClient } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";

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
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-6 text-center transition-colors hover:border-primary"
    >
      <Icon className="h-6 w-6 text-primary" aria-hidden />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  );
}

export default function CustomerDashboardPage() {
  const { user } = useAuth();
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickAction href="/orders" icon={Package} label="My Orders" />
        <QuickAction href="/tracking" icon={MapPin} label="Track a Shipment" />
        <QuickAction href="/profile" icon={UserIcon} label="My Profile" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" aria-hidden />}
              title="No orders yet"
            />
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
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:border-primary"
                  >
                    <span className="font-mono text-sm">
                      {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                    </span>
                    <TrackingStatusBadge status={shipment?.currentStatus} />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
