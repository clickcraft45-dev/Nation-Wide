"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AdminUserDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
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
          err instanceof ApiError ? "Failed to load staff accounts." : "Something went wrong.",
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Staff &amp; Admins</h1>
          <p className="text-sm text-muted-foreground">
            Internal accounts that can sign into this panel. Pickup partners are managed
            separately, and customers under Customers.
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
                    <Badge variant={u.role === "ADMIN" ? "success" : "neutral"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "success" : "neutral"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isSelf}
                        onClick={() =>
                          patch(
                            u.id,
                            { role: u.role === "ADMIN" ? "STAFF" : "ADMIN" },
                            u.role === "ADMIN" ? "Changed to Staff" : "Promoted to Admin",
                          )
                        }
                      >
                        {u.role === "ADMIN" ? "Make Staff" : "Make Admin"}
                      </Button>
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
