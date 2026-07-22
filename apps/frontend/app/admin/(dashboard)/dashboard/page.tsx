"use client";

import { useEffect, useState } from "react";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  CreditCard,
  CalendarClock,
  Users,
  FileQuestion,
} from "lucide-react";
import type { OrderDto, CustomerDto, AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { ErrorState } from "@/components/ui/page-state";

function displayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

export default function AdminDashboardHomePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<AuditLogEntryDto[]>("/admin/audit-logs"),
    ])
      .then(([ordersRes, customersRes, auditRes]) => {
        if (cancelled) return;
        setOrders(ordersRes);
        setCustomers(customersRes);
        setAuditLogs(auditRes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? "Failed to load dashboard data."
            : "Something went wrong loading the dashboard.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  const primaryStatus = (order: OrderDto) => order.shipments[0]?.currentStatus ?? null;
  const ordersInTransit =
    orders?.filter((o) =>
      ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(primaryStatus(o) ?? ""),
    ).length ?? 0;
  const ordersDelivered = orders?.filter((o) => primaryStatus(o) === "DELIVERED").length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back, {user ? displayName(user.email) : "there"}.
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Orders"
          value={orders?.length ?? 0}
          icon={Package}
          href="/admin/orders"
          isLoading={isLoading}
        />
        <KpiCard
          title="Orders In Transit"
          value={ordersInTransit}
          icon={Truck}
          href="/admin/orders?status=in-transit"
          isLoading={isLoading}
        />
        <KpiCard
          title="Orders Delivered"
          value={ordersDelivered}
          icon={CheckCircle2}
          href="/admin/orders?status=delivered"
          isLoading={isLoading}
        />
        <KpiCard
          title="Total Customers"
          value={customers?.length ?? 0}
          icon={Users}
          href="/admin/customers"
          isLoading={isLoading}
        />
        <KpiCard
          title="Pending Pickups"
          value={2}
          icon={Clock}
          href="/admin/pickups"
          hint="Placeholder — no pickup backend yet"
        />
        <KpiCard
          title="Today's Pickups"
          value={2}
          icon={CalendarClock}
          href="/admin/pickups"
          hint="Placeholder — no pickup backend yet"
        />
        <KpiCard
          title="Pending Payments"
          value={2}
          icon={CreditCard}
          href="/admin/payments"
          hint="Placeholder — no payment backend yet"
        />
        <KpiCard
          title="Pending Quote Requests"
          value={2}
          icon={FileQuestion}
          href="/admin/quotes"
          hint="Placeholder — no quote backend yet"
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Quick actions</h2>
        <QuickActions />
      </div>

      <div className="max-w-2xl">
        <RecentActivity entries={auditLogs} isLoading={isLoading} />
      </div>
    </div>
  );
}
