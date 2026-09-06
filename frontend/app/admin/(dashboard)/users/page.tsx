"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AdminUserDto, ManagedAdminRole } from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/state/auth-context";
import { AdminUserDialog } from "@/components/admin-users/admin-user-dialog";
import { EditAdminUserDialog } from "@/components/admin-users/edit-admin-user-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ROLE_OPTIONS: ManagedAdminRole[] = ['STAFF', 'ADMIN', 'PICKUP_PARTNER'];

const ROLE_LABELS: Record<ManagedAdminRole, string> = {
  STAFF: 'Staff',
  ADMIN: 'Admin',
  PICKUP_PARTNER: 'Pickup partner',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<AdminUserDto[]>("/admin/users")
      .then(setUsers)
      .catch((err) => {
        setError(
          errorMessage(err, "Failed to load staff accounts."),
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  /** Shared by both mutations — the failure messages differ but the plumbing does not. */
  async function patch(
    id: string,
    body: Record<string, unknown>,
    successTitle: string,
  ) {
    try {
      const updated = await apiClient.patch<AdminUserDto>(`/admin/users/${id}`, body);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      showToast({ variant: "success", title: successTitle });
    } catch (err) {
      // The backend refuses self-demotion and removing the last admin. Those come back as
      // 403/400 with a specific reason worth surfacing verbatim — a generic "try again" would
      // send the admin round the same loop.
      showToast({
        variant: "error",
        title:
          err instanceof ApiError && (err.status === 400 || err.status === 403)
            ? err.message
            : "Couldn't update the account. Please try again.",
      });
    }
  }

  async function remove(u: AdminUserDto) {
    try {
      await apiClient.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      showToast({ variant: "success", title: `${u.email} deleted` });
    } catch (err) {
      // A 409 means the account has activity recorded against it and says to deactivate
      // instead — exactly the guidance the admin needs, so it is shown verbatim.
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't delete the account."),
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Staff, Admins &amp; Partners</h1>
          <p className="text-sm text-muted-foreground">
            Every internal account. Change a role to move someone between the office and the
            field without recreating them. Customers live under Customers.
          </p>
        </div>
        <AdminUserDialog
          trigger={<Button size="sm">+ New Staff</Button>}
          onSaved={(user) => setUsers((prev) => [user, ...prev])}
        />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && users.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" aria-hidden />}
          title="No staff accounts yet"
          description="Create one so colleagues can sign into the admin panel."
        />
      )}

      {!isLoading && !error && users.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              // The backend enforces this too; disabling the buttons just avoids offering an
              // action that is guaranteed to fail.
              const isSelf = u.id === currentUser?.id;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">
                    {u.name ?? "—"}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) =>
                        patch(
                          u.id,
                          { role: e.target.value as ManagedAdminRole },
                          `Role changed to ${ROLE_LABELS[e.target.value as ManagedAdminRole]}`,
                        )
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
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
                          setUsers((prev) =>
                            prev.map((x) => (x.id === updated.id ? updated : x)),
                          )
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
                          patch(
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
                        onConfirm={() => remove(u)}
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
          </TableBody>
        </Table>
      )}
    </div>
  );
}
