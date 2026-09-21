"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { FuelSurchargeCheckDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";

/**
 * What the carriers publish, next to what we charge.
 *
 * Checking is on a button rather than on page load: it reaches out to carrier sites, which are
 * slow and sometimes down, and this page's real job (the provider cards below) must not wait on
 * them. Nothing here changes a price until Apply is pressed — fuel feeds every quote, so a figure
 * scraped off a page that changed shape must never reprice the book on its own.
 */
export function FuelSurchargePanel() {
  const [rows, setRows] = useState<FuelSurchargeCheckDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  function check() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<FuelSurchargeCheckDto[]>("/admin/rate-providers/fuel-surcharges")
      .then(setRows)
      .catch((err) => setError(errorMessage(err, "Couldn't check the carrier sites.")))
      .finally(() => setIsLoading(false));
  }

  async function apply(
    row: FuelSurchargeCheckDto,
    percent: number,
    source: "CARRIER_SITE" | "MANUAL",
    label?: string,
  ) {
    try {
      await apiClient.post(`/admin/rate-providers/${row.rateProviderId}/fuel-surcharge`, {
        percent,
        source,
        label,
      });
      showToast({
        variant: "success",
        title: `${row.name} fuel surcharge set to ${percent}%`,
      });
      setManual((m) => ({ ...m, [row.rateProviderId]: "" }));
      check();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't apply that surcharge.") });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-foreground">Carrier fuel surcharges</p>
            <p className="text-sm text-muted-foreground">
              DHL publishes its weekly figure in a readable page, so it is fetched. UPS and FedEx
              serve theirs to browsers only — open the link and enter the number.
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={isLoading} onClick={check}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {rows ? "Check again" : "Check carrier sites"}
          </Button>
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && error && <ErrorState message={error} onRetry={check} />}

        {!isLoading &&
          !error &&
          rows?.map((row) => (
            <div key={row.rateProviderId} className="space-y-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{row.name}</span>
                <Badge variant="neutral">Now {row.configuredPercent}%</Badge>
                {row.fetchedPercent !== null && (
                  <Badge
                    variant={row.fetchedPercent === row.configuredPercent ? "success" : "warning"}
                  >
                    Site says {row.fetchedPercent}%
                    {row.fetchedLabel ? ` (${row.fetchedLabel})` : ""}
                  </Badge>
                )}
                {row.sourceUrl && (
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline hover:text-foreground"
                  >
                    Open page
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{row.note}</p>
              {row.error && <p className="text-xs text-destructive">{row.error}</p>}

              <div className="flex flex-wrap items-end gap-2">
                {row.fetchedPercent !== null && row.fetchedPercent !== row.configuredPercent && (
                  <Button
                    size="sm"
                    onClick={() =>
                      apply(row, row.fetchedPercent!, "CARRIER_SITE", row.fetchedLabel ?? undefined)
                    }
                  >
                    Apply {row.fetchedPercent}%
                  </Button>
                )}
                {/* The override stays available even for DHL: a fetched figure that looks wrong
                    has to be correctable without waiting on a code change. */}
                <div className="space-y-1.5">
                  <Label htmlFor={`fuel-${row.rateProviderId}`}>Set by hand (%)</Label>
                  <Input
                    id={`fuel-${row.rateProviderId}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-32"
                    value={manual[row.rateProviderId] ?? ""}
                    onChange={(e) =>
                      setManual((m) => ({ ...m, [row.rateProviderId]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!Number(manual[row.rateProviderId])}
                  onClick={() => apply(row, Number(manual[row.rateProviderId]), "MANUAL")}
                >
                  Save
                </Button>
              </div>

              {row.history.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {/* Only the last five are kept — older rows are pruned on every update. */}
                  {row.history.map((update) => (
                    <li key={update.id}>
                      {new Date(update.createdAt).toLocaleString("en-IN")} ·{" "}
                      {update.previousPercent}% → {update.percent}%
                      {update.label ? ` (${update.label})` : ""} ·{" "}
                      {update.source === "CARRIER_SITE" ? "from carrier site" : "entered by hand"}
                      {update.appliedByEmail ? ` · ${update.appliedByEmail}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
