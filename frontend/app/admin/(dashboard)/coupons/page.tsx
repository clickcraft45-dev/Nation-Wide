"use client";

import { useEffect, useState } from "react";
import { TicketPercent, Trash2 } from "lucide-react";
import type { CouponDto } from "@nationwide/shared-types";
import { isCouponUsable } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/** Why a code cannot be used right now, in the words the admin would use for it. */
function statusLabel(coupon: CouponDto): string {
  if (!coupon.isActive) return "Retired";
  if (isCouponUsable(coupon)) return "Live";
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "Expired";
  return "Fully used";
}

/**
 * Discount codes: create one, hand it out, retire it when it has done its job, delete it when it
 * should be gone. Double-click a row to see who used it.
 *
 * Deleting a code nobody used removes it. Deleting one that discounted a booking hides it and
 * stops it working, but keeps it, because those bookings still name the code they used.
 */
export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [code, setCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CouponDto[]>("/admin/coupons")
      .then(setCoupons)
      .catch((err) => setError(errorMessage(err, "Failed to load coupons.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot fetch on mount, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create() {
    setIsCreating(true);
    try {
      await apiClient.post("/admin/coupons", {
        code: code.trim(),
        discountAmount: Number(discountAmount),
        // An empty date input means "never expires", and a date that is given means the end of
        // that day — a coupon printed as "valid to the 30th" should work on the 30th.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      showToast({ variant: "success", title: `Coupon ${code.trim().toUpperCase()} created` });
      setCode("");
      setDiscountAmount("");
      setExpiresAt("");
      setMaxRedemptions("");
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't create that coupon.") });
    } finally {
      setIsCreating(false);
    }
  }

  async function setActive(coupon: CouponDto, isActive: boolean) {
    try {
      await apiClient.patch(`/admin/coupons/${coupon.id}/active`, { isActive });
      showToast({
        variant: "success",
        title: isActive ? `${coupon.code} is live again` : `${coupon.code} retired`,
      });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't update that coupon.") });
    }
  }

  async function remove(coupon: CouponDto) {
    try {
      const { hidden } = await apiClient.delete<{ hidden: boolean }>(`/admin/coupons/${coupon.id}`);
      setCoupons((all) => all.filter((c) => c.id !== coupon.id));
      showToast({
        variant: "success",
        title: `${coupon.code} deleted`,
        description: hidden ? "It had been used, so it stays on those bookings but no longer works." : undefined,
      });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete that coupon.") });
    }
  }

  const canCreate = code.trim().length >= 3 && Number(discountAmount) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Flat-rupee discount codes. Customers enter one when booking, or staff apply it when
          marking an order paid. Double-click a code to see who used it.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                placeholder="DIWALI500"
                value={code}
                // Upper-cased as it is typed, because that is how it is stored and how it gets
                // read back out over the phone.
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-amount">Discount (₹)</Label>
              <Input
                id="coupon-amount"
                type="number"
                min="1"
                step="1"
                placeholder="500"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-expiry">Expires (optional)</Label>
              <DateField
                id="coupon-expiry"
                title="Coupon expiry"
                subtitle="Leave empty for a code that never expires"
                placeholder="Never expires"
                value={expiresAt}
                clearable
                onChange={setExpiresAt}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-limit">Max uses (optional)</Label>
              <Input
                id="coupon-limit"
                type="number"
                min="1"
                step="1"
                placeholder="Unlimited"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
              />
            </div>
            <Button onClick={create} disabled={!canCreate} isLoading={isCreating}>
              Create coupon
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton columns={6} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && coupons.length === 0 && (
        <EmptyState
          icon={<TicketPercent className="h-8 w-8" aria-hidden />}
          title="No coupons yet"
          description="Create one above and it can be applied on the Payments screen."
        />
      )}

      {!isLoading && !error && coupons.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.id} href={`/admin/coupons/${coupon.id}`}>
                <TableCell className="font-mono font-medium text-foreground">
                  {coupon.code}
                </TableCell>
                <TableCell>{rupees(coupon.discountAmount)}</TableCell>
                <TableCell>{formatDate(coupon.expiresAt)}</TableCell>
                <TableCell>
                  {coupon.timesUsed}
                  {coupon.maxRedemptions !== null && ` / ${coupon.maxRedemptions}`}
                </TableCell>
                {/* "Active" but unusable is worth spelling out: an expired or exhausted code
                    still reads as on in the database and confuses whoever tries it. */}
                <TableCell>{statusLabel(coupon)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActive(coupon, !coupon.isActive)}
                    >
                      {coupon.isActive ? "Retire" : "Reactivate"}
                    </Button>
                    <ConfirmDialog
                      title={`Delete ${coupon.code}?`}
                      description={
                        coupon.timesUsed > 0
                          ? "It stops working at once. The bookings it discounted keep showing it."
                          : "It stops working at once and the code can be created again later."
                      }
                      confirmLabel="Delete coupon"
                      variant="danger"
                      onConfirm={() => remove(coupon)}
                      trigger={
                        <button
                          type="button"
                          aria-label={`Delete coupon ${coupon.code}`}
                          title="Delete"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
