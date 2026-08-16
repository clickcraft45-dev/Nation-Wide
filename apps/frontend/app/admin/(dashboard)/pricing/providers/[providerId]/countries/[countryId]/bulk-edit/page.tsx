"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { RateDto, ShipmentTypeCode } from "@nationwide/shared-types";
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
import { Input, Label, FieldError } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Row {
  id: string;
  weightLabel: string;
  currentBaseRate: number;
  baseRate: string;
  gstPercent: string;
  nationwideCut: string;
}

function toRows(rates: RateDto[]): Row[] {
  return rates.map((r) => ({
    id: r.id,
    weightLabel: r.weightFromKg === r.weightToKg ? `${r.weightFromKg}kg` : `${r.weightFromKg}-${r.weightToKg}kg`,
    currentBaseRate: r.baseRate,
    baseRate: String(r.baseRate),
    gstPercent: String(r.gstPercent),
    nationwideCut: String(r.nationwideCut),
  }));
}

export default function BulkEditPage() {
  const params = useParams<{ providerId: string; countryId: string }>();
  const searchParams = useSearchParams();
  const shipmentType = (searchParams.get("shipmentType") as ShipmentTypeCode | null) ?? "PACKAGE";
  const router = useRouter();
  const { showToast } = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const backHref = `/admin/pricing/providers/${params.providerId}/countries/${params.countryId}`;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .get<RateDto[]>(
        `/admin/rate-providers/${params.providerId}/countries/${params.countryId}/rates?shipmentType=${shipmentType}`,
      )
      .then((rates) => {
        if (!cancelled) setRows(toRows(rates));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? "Failed to load rates." : "Something went wrong.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.providerId, params.countryId, shipmentType]);

  function updateRow(id: string, field: "baseRate" | "gstPercent" | "nationwideCut", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    setError(null);
    const updates = rows.map((r) => ({
      id: r.id,
      baseRate: Number(r.baseRate),
      gstPercent: Number(r.gstPercent) || 0,
      nationwideCut: Number(r.nationwideCut) || 0,
    }));
    if (updates.some((u) => Number.isNaN(u.baseRate) || u.baseRate <= 0)) {
      setError("Every row needs a positive rate.");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.patch("/admin/rates/bulk", { updates, reason: reason.trim() || undefined });
      showToast({ variant: "success", title: `Updated ${updates.length} rate${updates.length === 1 ? "" : "s"}` });
      router.push(backHref);
    } catch {
      showToast({ variant: "error", title: "Couldn't save changes. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to country
      </Link>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Bulk Edit Rates</h2>
        <p className="text-sm text-muted-foreground">
          Update every weight category for this country and shipment type at once. Weight ranges
          can&apos;t be changed here — edit a single rate to change its range.
        </p>
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title="No weight categories to edit" description="Add a rate first." />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Weight</TableHead>
                <TableHead>Fixed Rate</TableHead>
                <TableHead>GST %</TableHead>
                <TableHead>NationWide Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.weightLabel}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-28"
                      value={row.baseRate}
                      onChange={(e) => updateRow(row.id, "baseRate", e.target.value)}
                      aria-label={`Fixed rate for ${row.weightLabel}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-20"
                      value={row.gstPercent}
                      onChange={(e) => updateRow(row.id, "gstPercent", e.target.value)}
                      aria-label={`GST percent for ${row.weightLabel}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-24"
                      value={row.nationwideCut}
                      onChange={(e) => updateRow(row.id, "nationwideCut", e.target.value)}
                      aria-label={`NationWide margin for ${row.weightLabel}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-reason">Reason (optional)</Label>
            <Input
              id="bulk-reason"
              placeholder="e.g. Quarterly carrier rate revision"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push(backHref)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSaving} onClick={handleSave}>
              Save Once
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
