"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Users } from "lucide-react";
import type { CouponDetailDto, CouponUsageDto } from "@nationwide/shared-types";
import { isCouponUsable } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { BackLink } from "@/components/ui/back-link";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { formatDateTime } from "@/lib/utils/format-date-time";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function stateLabel(usage: CouponUsageDto): { text: string; tone: string } {
  if (usage.status === "CANCELLED" || usage.status === "REJECTED") {
    return { text: usage.status === "CANCELLED" ? "Cancelled, not redeemed" : "Rejected, not redeemed", tone: "text-muted-foreground" };
  }
  if (usage.redeemed) return { text: "Redeemed", tone: "text-success" };
  return { text: "Applied, parcel not collected yet", tone: "text-warning" };
}

/** Who used a coupon: every booking it was applied to, opened by double-clicking its row. */
export default function AdminCouponDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<CouponDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    apiClient
      .get<CouponDetailDto>(`/admin/coupons/${id}`)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err, "Failed to load this coupon.")));
  }

  useEffect(() => {
    // One-shot fetch for this page's id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const usages = detail?.usages ?? [];
  const redeemed = usages.filter((u) => u.redeemed);
  const customers = new Set(usages.map((u) => u.customerId)).size;
  const totalOff = redeemed.reduce((sum, u) => sum + u.discountAmount, 0);

  return (
    <div className="space-y-6">
      <BackLink href="/admin/coupons">Back to coupons</BackLink>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && !detail && <TableSkeleton columns={6} />}

      {detail && (
        <>
          <div>
            <h1 className="font-mono text-xl font-semibold text-foreground">{detail.coupon.code}</h1>
            <p className="text-sm text-muted-foreground">
              {rupees(detail.coupon.discountAmount)} off ·{" "}
              {!detail.coupon.isActive ? "Retired" : isCouponUsable(detail.coupon) ? "Live" : "Not usable now"}
              {detail.coupon.expiresAt &&
                ` · expires ${new Date(detail.coupon.expiresAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Redeemed"
              value={`${detail.coupon.timesUsed}${detail.coupon.maxRedemptions !== null ? ` / ${detail.coupon.maxRedemptions}` : ""}`}
            />
            <StatCard label="Bookings using it" value={usages.length} />
            <StatCard label="Customers" value={customers} />
            <StatCard label="Given away" value={rupees(totalOff)} caption="On redeemed bookings" />
          </div>

          {usages.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" aria-hidden />}
              title="Nobody has used this code yet"
              description="Bookings appear here as soon as a customer applies it, or staff apply it when marking an order paid."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Booking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map((u) => {
                  const state = stateLabel(u);
                  const href =
                    u.kind === "PICKUP" ? `/admin/pickup-requests/${u.id}` : `/admin/orders/${u.orderId}`;
                  return (
                    <TableRow key={`${u.kind}-${u.id}`} href={href}>
                      <TableCell>
                        <Link
                          href={`/admin/customers/${u.customerId}`}
                          className="font-medium text-foreground hover:underline focus-visible:underline"
                        >
                          {u.customerName}
                        </Link>
                        {u.customerPhone && <p className="text-xs text-muted-foreground">{u.customerPhone}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(u.usedAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{rupees(u.discountAmount)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-medium ${state.tone}`}>{state.text}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {u.trackingNumber ? (
                          <span className="font-mono text-sm text-foreground">{u.trackingNumber}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {u.kind === "PICKUP" ? "Pickup request" : "Order"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
