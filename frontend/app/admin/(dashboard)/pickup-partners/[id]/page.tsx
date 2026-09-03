"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Package, Wallet } from "lucide-react";
import type { PickupPartnerDto, PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";

// ponytail: assembled from the two list endpoints that already exist rather than a new
// GET /admin/pickup-partners/:id plus per-partner pickups and collections endpoints. There are
// at most a few dozen partners, and the pickup-request list is already the admin dashboard's
// working set. Add a real per-partner endpoint when either list outgrows a single fetch.

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/** Anything the partner is still expected to act on — the rest is history. */
const OPEN_STATUSES = new Set([
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
]);

export default function PickupPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [partner, setPartner] = useState<PickupPartnerDto | null>(null);
  const [requests, setRequests] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<PickupPartnerDto[]>("/admin/pickup-partners"),
      apiClient.get<PickupRequestDto[]>("/admin/pickup-requests"),
    ])
      .then(([partners, pickupRequests]) => {
        const found = partners.find((p) => p.id === id) ?? null;
        setPartner(found);
        setRequests(pickupRequests.filter((p) => p.assignedPartnerId === id));
        if (!found) setError("That pickup partner no longer exists.");
      })
      .catch((err) =>
        setError(err instanceof ApiError ? "Failed to load the partner." : "Something went wrong."),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const stats = useMemo(() => {
    const collections = requests.filter((p) => p.collectedAmount !== null);
    return {
      assigned: requests.length,
      open: requests.filter((p) => OPEN_STATUSES.has(p.status)).length,
      orders: requests.filter((p) => p.orderId !== null).length,
      collections,
      collected: collections.reduce((sum, p) => sum + (p.collectedAmount ?? 0), 0),
    };
  }, [requests]);

  const byNewest = useMemo(
    () => [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests],
  );

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/pickup-partners"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All pickup partners
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {partner?.name ?? "Pickup partner"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {partner?.email}
            {partner?.phone ? ` · ${partner.phone}` : ""}
          </p>
        </div>
        {partner && (
          <Badge variant={partner.isActive ? "success" : "neutral"}>
            {partner.isActive ? "Active" : "Inactive"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Pickups assigned", value: stats.assigned, icon: ClipboardList },
          { label: "Still open", value: stats.open, icon: ClipboardList },
          { label: "Orders generated", value: stats.orders, icon: Package },
          { label: "Total collected", value: money(stats.collected), icon: Wallet },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex items-start justify-between pt-5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
                <p className="text-2xl font-semibold text-foreground">{tile.value}</p>
              </div>
              <tile.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pickups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton columns={6} />
          ) : byNewest.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" aria-hidden />}
              title="No pickups assigned yet"
              description="Assign this partner from the pickup requests page."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byNewest.map((p) => (
                  <TableRow key={p.id} href={`/admin/pickup-requests/${p.id}`}>
                    <TableCell>
                      <span className="font-medium text-foreground">{p.customerName}</span>
                      <p className="text-xs text-muted-foreground">{p.customerPhone}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.dropAtWarehouse
                        ? "Warehouse drop-off"
                        : `${p.pickupCity}, ${p.pickupState}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {p.pickupDate ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PickupRequestStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.verifiedPrice !== null ? money(p.verifiedPrice) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.orderId ? p.orderId.slice(0, 8) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton columns={5} />
          ) : stats.collections.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" aria-hidden />}
              title="Nothing collected yet"
              description="Payments this partner takes at the door will be listed here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collected</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.collections.map((p) => (
                  <TableRow key={p.id} href={`/admin/pickup-requests/${p.id}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {p.paymentCollectedAt
                        ? new Date(p.paymentCollectedAt).toLocaleString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>{p.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {money(p.collectedAmount ?? 0)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.paymentMethod ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.paymentReference ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
