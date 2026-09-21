"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { AdminUserDto, CustomerDto, ManagedAdminRole } from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/state/auth-context";
import { AdminUserDialog } from "@/components/admin-users/admin-user-dialog";
import { EditAdminUserDialog } from "@/components/admin-users/edit-admin-user-dialog";
import { PickupPartnerDialog } from "@/components/pickup-partners/pickup-partner-dialog";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";

type Tab = "all" | "customers" | "businesses" | "partners" | "admins" | "super-admins";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "customers", label: "Customers" },
  { value: "businesses", label: "Businesses" },
  { value: "partners", label: "Pickup partners" },
  { value: "admins", label: "Admins" },
  { value: "super-admins", label: "Super admins" },
];

const ROLE_OPTIONS: ManagedAdminRole[] = ["ADMIN", "SUPER_ADMIN", "PICKUP_PARTNER"];

const ROLE_LABELS: Record<ManagedAdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  PICKUP_PARTNER: "Pickup partner",
};

/**
 * Everyone the company deals with, on one screen: customers, businesses, partners and staff.
 *
 * They used to be three pages because they are three tables underneath, but nobody thinks in
 * tables — they think "add a partner" or "who is this person". The slider picks the audience and
 * the create button follows it, so adding a partner on the partners tab is one click rather than
 * a hunt for the right page.
 *
 * Roles stay honest: a customer is a Customer row and a partner is an AdminUser row, so promoting
 * a customer to staff is not offered here, because the server cannot do it either.
 */
export default function AdminPeoplePage() {
  const [tab, setTab] = useState<Tab>("all");
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [staff, setStaff] = useState<AdminUserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      // ponytail: one page of each is enough for a directory anyone reads with the search box.
      // Add paging when a real account list outgrows it.
      apiClient.get<CustomerDto[]>("/customers?pageSize=200"),
      apiClient.get<AdminUserDto[]>("/admin/users"),
    ])
      .then(([customerRows, staffRows]) => {
        setCustomers(customerRows);
        setStaff(staffRows);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load accounts.")))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function setCustomerActive(customer: CustomerDto, isActive: boolean) {
    try {
      const updated = await apiClient.patch<CustomerDto>(`/customers/${customer.id}/active`, {
        isActive,
      });
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast({
        variant: "success",
        title: isActive ? "Customer reactivated" : "Customer deactivated",
      });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't update the customer.") });
    }
  }

  async function patchStaff(id: string, body: Record<string, unknown>, successTitle: string) {
    try {
      const updated = await apiClient.patch<AdminUserDto>(`/admin/users/${id}`, body);
      setStaff((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      showToast({ variant: "success", title: successTitle });
    } catch (err) {
      // The server refuses self-demotion and removing the last privileged account, with a reason
      // worth repeating verbatim — a generic "try again" sends the admin round the same loop.
      showToast({
        variant: "error",
        title:
          err instanceof ApiError && (err.status === 400 || err.status === 403)
            ? err.message
            : "Couldn't update the account. Please try again.",
      });
    }
  }

  async function removeStaff(user: AdminUserDto) {
    try {
      await apiClient.delete(`/admin/users/${user.id}`);
      setStaff((prev) => prev.filter((u) => u.id !== user.id));
      showToast({ variant: "success", title: `${user.email} deleted` });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete the account.") });
    }
  }

  const term = search.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    !term || fields.some((field) => (field ?? "").toLowerCase().includes(term));

  const visibleCustomers = customers.filter(
    (c) =>
      matches(c.name, c.email, c.phone) &&
      (tab === "all" || tab === "customers" || (tab === "businesses" && c.isB2b)) &&
      // The Customers tab is consumers; businesses have their own, so they are not listed twice.
      !(tab === "customers" && c.isB2b),
  );

  const visibleStaff = staff.filter((u) => {
    if (!matches(u.name, u.email, u.phone)) return false;
    if (tab === "all") return true;
    if (tab === "partners") return u.role === "PICKUP_PARTNER";
    if (tab === "admins") return u.role === "ADMIN";
    if (tab === "super-admins") return u.role === "SUPER_ADMIN";
    return false;
  });

  const isEmpty = visibleCustomers.length === 0 && visibleStaff.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">People</h1>
          <p className="text-sm text-muted-foreground">
            Customers, businesses, pickup partners and staff. Pick an audience and the create button
            follows it.
          </p>
        </div>
        <CreateFor tab={tab} onCustomer={load} onStaff={load} />
      </div>

      <SegmentedControl ariaLabel="Which people" value={tab} onChange={setTab} options={TABS} />

      <div className="sm:w-72">
        <SearchInput
          placeholder="Search name, email or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search people"
        />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && isEmpty && (
        <EmptyState
          icon={<Users className="h-8 w-8" aria-hidden />}
          title={term ? "Nobody matches that search" : "Nobody here yet"}
          description="Create the first one with the button above."
        />
      )}

      {!isLoading && !error && !isEmpty && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStaff.map((u) => {
              // The server enforces this too; disabling the controls just avoids offering an
              // action guaranteed to fail.
              const isSelf = u.id === currentUser?.id;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">
                    {u.role === "PICKUP_PARTNER" ? (
                      <Link
                        href={`/admin/pickup-partners/${u.id}`}
                        className="underline hover:text-foreground"
                      >
                        {u.name ?? u.email}
                      </Link>
                    ) : (
                      (u.name ?? "—")
                    )}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                    {u.phone ? <span className="block text-xs">{u.phone}</span> : null}
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) =>
                        patchStaff(
                          u.id,
                          { role: e.target.value as ManagedAdminRole },
                          `Role changed to ${ROLE_LABELS[e.target.value as ManagedAdminRole]}`,
                        )
                      }
                      className="w-36"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "success" : "neutral"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <EditAdminUserDialog
                        user={u}
                        onSaved={(updated) =>
                          setStaff((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                        }
                        trigger={
                          <Button variant="secondary" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isSelf}
                        onClick={() =>
                          patchStaff(
                            u.id,
                            { isActive: !u.isActive },
                            u.isActive ? "Account deactivated" : "Account reactivated",
                          )
                        }
                      >
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                      <ConfirmDialog
                        title={`Delete ${u.email}?`}
                        description="This only works for an account with no recorded activity. Anything that has priced a quote, run a pickup or issued an invoice must be deactivated instead, so the record of what they did survives."
                        confirmLabel="Delete"
                        variant="danger"
                        onConfirm={() => removeStaff(u)}
                        trigger={
                          <Button variant="secondary" size="sm" disabled={isSelf}>
                            Delete
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {visibleCustomers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-foreground">
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="underline hover:text-foreground"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.email ?? "—"}
                  <span className="block text-xs">{c.phone}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={c.isB2b ? "info" : "neutral"}>
                    {c.isB2b ? "Business" : "Customer"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={c.isActive ? "success" : "neutral"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Open
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCustomerActive(c, !c.isActive)}
                    >
                      {c.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
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

/**
 * The create button for whichever audience is on screen.
 *
 * Each kind keeps its own dialog because each asks for genuinely different things — a partner
 * gets emailed credentials, a business gets an ordering link, a customer gets neither.
 */
function CreateFor({
  tab,
  onCustomer,
  onStaff,
}: {
  tab: Tab;
  onCustomer: () => void;
  onStaff: () => void;
}) {
  const customer = (
    <CreateCustomerDialog
      key="customer"
      trigger={<Button size="sm">+ New customer</Button>}
      onCreated={onCustomer}
    />
  );
  // Businesses are created where their ordering link is issued — the link is the whole point of
  // making one, and it is emailed the moment it exists.
  const business = (
    <Link key="business" href="/admin/b2b-links" className={buttonVariants({ size: "sm" })}>
      + New business
    </Link>
  );
  const partner = (
    <PickupPartnerDialog
      key="partner"
      trigger={<Button size="sm">+ New partner</Button>}
      onSaved={onStaff}
    />
  );
  const admin = (
    <AdminUserDialog
      key="admin"
      defaultRole="ADMIN"
      trigger={<Button size="sm">+ New admin</Button>}
      onSaved={onStaff}
    />
  );
  const superAdmin = (
    <AdminUserDialog
      key="super-admin"
      defaultRole="SUPER_ADMIN"
      trigger={<Button size="sm">+ New super admin</Button>}
      onSaved={onStaff}
    />
  );

  const byTab: Record<Tab, React.ReactNode> = {
    // On "All" there is no one right thing to create, so all four are offered rather than
    // guessing and making the other three a hunt.
    all: (
      <div className="flex flex-wrap gap-2">
        {customer}
        {business}
        {partner}
        {admin}
      </div>
    ),
    customers: customer,
    businesses: business,
    partners: partner,
    admins: admin,
    "super-admins": superAdmin,
  };

  return <>{byTab[tab]}</>;
}
