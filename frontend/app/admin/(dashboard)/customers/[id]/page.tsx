"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Pencil,
  Package,
  Truck,
  Trash2,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  IndianRupee,
  CalendarClock,
} from "lucide-react";
import { BackLink } from "@/components/ui/back-link";
import type {
  CustomerDto,
  OrderDto,
  PickupDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, EmptyState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { DetailLayout } from "@/components/ui/detail-layout";
import {
  TrackingStatusBadge,
  PaymentStatusBadge,
  PickupStatusBadge,
} from "@/components/ui/status-badge";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { B2bLinksCard } from "@/components/customers/b2b-links-card";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * One customer or business: who they are, what they have shipped, and (for a business) the
 * portal access and ordering links that let their teams book.
 *
 * Two columns on a wide screen: the work on the left, the facts about the account in a narrow
 * rail on the right. A business leads with its access and links, since issuing and revoking those
 * is what an admin opens a business for; a consumer leads with their shipments.
 */
export default function AdminCustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [pickups, setPickups] = useState<PickupDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  // Deactivating blocks sign-in and hides them from booking; deleting is only possible while they
  // have no history at all, and the server says so plainly when they do.
  async function setActive(isActive: boolean) {
    try {
      const updated = await apiClient.patch<CustomerDto>(
        `/customers/${params.id}/active`,
        { isActive },
      );
      setCustomer(updated);
      showToast({
        variant: "success",
        title: isActive ? "Account reactivated" : "Account deactivated",
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't update this account."),
      });
    }
  }

  async function remove() {
    try {
      await apiClient.delete(`/customers/${params.id}`);
      showToast({
        variant: "success",
        title: `${customer?.name ?? "Account"} deleted`,
      });
      router.push("/admin/people");
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't delete this account."),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Refetching when the route param changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<CustomerDto>(`/customers/${params.id}`),
      apiClient.get<OrderDto[]>(`/orders?customerId=${params.id}`),
      apiClient.get<PickupDto[]>("/admin/pickups"),
      apiClient.get<PickupDto[]>("/admin/pickups/drop-offs"),
    ])
      .then(([customerRes, customerOrders, pickupsRes, dropOffsRes]) => {
        if (cancelled) return;
        const customerOrderIds = new Set(customerOrders.map((o) => o.id));
        setCustomer(customerRes);
        setOrders(customerOrders);
        setPickups(
          [...pickupsRes, ...dropOffsRes].filter(
            (p) => p.orderId && customerOrderIds.has(p.orderId),
          ),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Account not found."
            : "Failed to load this account.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-72" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-6">
        <BackLink href="/admin/people">Back to people</BackLink>
        <ErrorState message={error ?? "Account not found."} />
      </div>
    );
  }

  const isBusiness = customer.isB2b;
  const paidTotal = orders.reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);
  const dueTotal = orders.reduce((sum, o) => sum + (o.dueAmount ?? 0), 0);
  const lastOrder = orders.reduce<string | null>(
    (latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest),
    null,
  );
  const links = (
    <B2bLinksCard customer={customer} onCustomerChange={setCustomer} />
  );

  return (
    <div className="space-y-6">
      <BackLink href="/admin/people">Back to people</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground text-balance">
              {customer.name}
            </h1>
            <Badge variant={isBusiness ? "info" : "neutral"}>
              {isBusiness ? "Business" : "Customer"}
            </Badge>
            {!customer.isActive && <Badge variant="neutral">Deactivated</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBusiness ? "Business" : "Customer"} since{" "}
            {day(customer.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditCustomerDialog
            customer={customer}
            onUpdated={setCustomer}
            trigger={
              <Button variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </Button>
            }
          />
          {/* Deactivation is the usual answer: it blocks sign-in and takes them out of the
              booking screens while their orders and invoices stay intact. */}
          <ConfirmDialog
            title={
              customer.isActive
                ? `Deactivate ${customer.name}?`
                : `Reactivate ${customer.name}?`
            }
            description={
              customer.isActive
                ? "They can no longer sign in, and staff will not see them when booking. Their orders, invoices and history are kept."
                : "They can sign in and be booked for again."
            }
            confirmLabel={customer.isActive ? "Deactivate" : "Reactivate"}
            variant={customer.isActive ? "danger" : "primary"}
            onConfirm={() => setActive(!customer.isActive)}
            trigger={
              <Button variant="secondary" size="sm">
                {customer.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            }
          />
          <ConfirmDialog
            title={`Delete ${customer.name}?`}
            description={`Permanent, and only possible while they have no orders, quotes or invoices. The server refuses otherwise and tells you to deactivate instead.${isBusiness ? " Their ordering links are removed with the account." : ""}`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={remove}
            trigger={
              <Button variant="secondary" size="sm">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Orders"
          value={<span className="tabular-nums">{orders.length}</span>}
          icon={Package}
        />
        <StatCard
          label="Paid to date"
          icon={IndianRupee}
          value={<span className="tabular-nums">{inr(paidTotal)}</span>}
          caption={
            dueTotal > 0 ? `${inr(dueTotal)} due on approved credit` : undefined
          }
        />
        <StatCard
          label="Pickups and drop-offs"
          value={<span className="tabular-nums">{pickups.length}</span>}
          icon={Truck}
        />
        <StatCard
          label="Last order"
          icon={CalendarClock}
          value={lastOrder ? day(lastOrder) : "None yet"}
        />
      </div>

      <DetailLayout
        aside={
          <>
            <ContactCard customer={customer} />
            {/* A consumer can be turned into a business from here; the card stays secondary for them. */}
            {!isBusiness && links}
          </>
        }
      >
        {isBusiness && links}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" aria-hidden />
              Shipments and payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                description="Orders booked for this account will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {orders.map((order) => {
                  const shipment = order.shipments[0];
                  return (
                    <li key={order.id}>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm text-foreground">
                            {shipment?.internalTrackingNumber ??
                              `Order ${order.id.slice(0, 8)}`}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {day(order.createdAt)}
                          </span>
                        </span>
                        <span className="text-right text-sm tabular-nums text-foreground sm:order-none">
                          {order.paidAmount != null ? (
                            inr(order.paidAmount)
                          ) : (
                            <span className="text-muted-foreground">
                              Unpaid
                            </span>
                          )}
                        </span>
                        <span className="justify-self-start sm:justify-self-end">
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </span>
                        <span className="justify-self-end">
                          <TrackingStatusBadge
                            status={shipment?.currentStatus}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" aria-hidden />
              Pickups and drop-offs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pickups.length === 0 ? (
              <EmptyState title="No pickup records" />
            ) : (
              <ul className="divide-y divide-border">
                {pickups.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span>
                      {p.method === "PICKUP"
                        ? `${p.scheduledDate ?? "Date not set"} · ${p.scheduledTimeSlot ?? "any time"}`
                        : "Warehouse drop-off"}
                    </span>
                    <PickupStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </DetailLayout>
    </div>
  );
}

function ContactCard({ customer }: { customer: CustomerDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <Fact icon={Phone} label="Phone">
            <a href={`tel:${customer.phone}`} className="hover:underline">
              {customer.phone}
            </a>
          </Fact>
          <Fact icon={Mail} label="Email">
            {customer.email ? (
              <a
                href={`mailto:${customer.email}`}
                className="break-all hover:underline"
              >
                {customer.email}
              </a>
            ) : (
              <span className="text-muted-foreground">Not on file</span>
            )}
          </Fact>
          <Fact icon={MapPin} label="Address">
            {customer.address ?? (
              <span className="text-muted-foreground">Not on file</span>
            )}
          </Fact>
          <Fact icon={ShieldCheck} label="Consent">
            {day(customer.consentGivenAt)}
            <span className="block text-xs text-muted-foreground">
              via {customer.consentSource.replaceAll("_", " ")}
            </span>
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-foreground">{children}</dd>
      </div>
    </div>
  );
}
