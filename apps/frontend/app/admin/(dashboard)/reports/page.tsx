"use client";

import { useEffect, useState } from "react";
import { Package, CalendarDays, CheckCircle2, Users } from "lucide-react";
import type { OrderDto, CustomerDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { listMockPayments } from "@/lib/mock-data";
import type { PaymentRecord } from "@/lib/types/placeholder";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart } from "@/components/reports/bar-chart";

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<ShippingProviderDto[]>("/shipping-providers"),
      listMockPayments(),
    ])
      .then(([o, c, p, pay]) => {
        setOrders(o);
        setCustomers(c);
        setProviders(p);
        setPayments(pay);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const days = lastNDays(7);
  const todayIso = new Date().toISOString().slice(0, 10);

  const ordersToday = orders.filter((o) => o.createdAt.slice(0, 10) === todayIso).length;
  const ordersThisWeek = orders.filter((o) => days.includes(o.createdAt.slice(0, 10))).length;
  const completedDeliveries = orders.filter(
    (o) => o.shipments[0]?.currentStatus === "DELIVERED",
  ).length;

  const ordersPerDay = days.map((day) => ({
    label: dayLabel(day),
    value: orders.filter((o) => o.createdAt.slice(0, 10) === day).length,
  }));

  const customersPerDay = days.map((day) => ({
    label: dayLabel(day),
    value: customers.filter((c) => c.createdAt.slice(0, 10) === day).length,
  }));

  const providerCounts = providers.map((p) => ({
    label: p.name,
    value: orders.filter((o) => o.shipments[0]?.providerId === p.id).length,
  }));

  const revenue = payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Orders and customer metrics are live; revenue is placeholder data pending a payments backend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Orders Today" value={ordersToday} isLoading={isLoading} />
        <StatCard icon={Package} label="Orders This Week" value={ordersThisWeek} isLoading={isLoading} />
        <StatCard
          icon={CheckCircle2}
          label="Completed Deliveries"
          value={completedDeliveries}
          isLoading={isLoading}
        />
        <StatCard icon={Users} label="Total Customers" value={customers.length} isLoading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : (
            <>
              <p className="text-2xl font-semibold text-foreground">
                ₹{revenue.toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">
                Placeholder — computed from mock payment data, not a real ledger.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shipment trends (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : <BarChart data={ordersPerDay} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer growth (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : <BarChart data={customersPerDay} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : providerCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No providers configured.</p>
          ) : (
            <BarChart data={providerCounts} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between pt-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-10" />
          ) : (
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          )}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
