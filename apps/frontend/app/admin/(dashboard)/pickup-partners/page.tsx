"use client";

import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import type { PickupPartnerDto } from "@nationwide/shared-types";
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
import { PickupPartnerDialog } from "@/components/pickup-partners/pickup-partner-dialog";

export default function AdminPickupPartnersPage() {
  const [partners, setPartners] = useState<PickupPartnerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupPartnerDto[]>("/admin/pickup-partners")
      .then(setPartners)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load pickup partners." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function toggleActive(partner: PickupPartnerDto) {
    try {
      const updated = await apiClient.patch<PickupPartnerDto>(
        `/admin/pickup-partners/${partner.id}`,
        { isActive: !partner.isActive },
      );
      setPartners((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast({
        variant: "success",
        title: updated.isActive ? "Partner reactivated" : "Partner deactivated",
      });
    } catch {
      showToast({ variant: "error", title: "Couldn't update the partner. Please try again." });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pickup Partners</h1>
          <p className="text-sm text-muted-foreground">
            Field executives who collect and verify parcels from customers. Double-click a row to
            see their pickups, orders and collections.
          </p>
        </div>
        <PickupPartnerDialog
          trigger={<Button size="sm">+ New Partner</Button>}
          onSaved={(partner) => setPartners((prev) => [partner, ...prev])}
        />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && partners.length === 0 && (
        <EmptyState
          icon={<UserCog className="h-8 w-8" aria-hidden />}
          title="No pickup partners yet"
          description="Create one so pickup requests can be assigned."
        />
      )}

      {!isLoading && !error && partners.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id} href={`/admin/pickup-partners/${p.id}`}>
                <TableCell className="font-medium text-foreground">{p.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.email}</TableCell>
                <TableCell className="text-muted-foreground">{p.phone ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="secondary" size="sm" onClick={() => toggleActive(p)}>
                    {p.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
