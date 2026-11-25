"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import type {
  FuelAutoApplyResultDto,
  FuelSurchargeCheckDto,
  FuelSurchargeRefreshDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";

// FedEx and UPS cannot be read by the server; a figure older than a week has most likely moved.
const STALE_DAYS = 7;

/**
 * What the carriers publish, next to what we charge.
 *
 * Opening the page refreshes it: the server reads DHL's published week and applies it when it
 * changed, and this panel says so at the top. It loads on its own, so the provider cards below
 * never wait on a carrier site. A jump too large to be a weekly move is held for the admin to
 * apply. FedEx and UPS refuse the server, so they are flagged when not updated for a week.
 *
 * onChanged lets the page reload its provider cards when a figure was applied.
 */
export function FuelSurchargePanel({ onChanged }: { onChanged?: () => void } = {}) {
  const [rows, setRows] = useState<FuelSurchargeCheckDto[] | null>(null);
  const [results, setResults] = useState<FuelAutoApplyResultDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  // When the rows were read: "days since" counts from here, not from each render.
  const [checkedAt, setCheckedAt] = useState(0);

  function check() {
    setIsLoading(true);
    setError(null);
    apiClient
      .post<FuelSurchargeRefreshDto>("/admin/rate-providers/fuel-surcharges/refresh", {})
      .then((res) => {
        setRows(res.rows);
        setResults(res.results);
        setCheckedAt(Date.now());
        const applied = res.results.filter((r) => r.outcome === "APPLIED");
        if (applied.length > 0) {
          const name = (code: string) => res.rows.find((row) => row.code === code)?.name ?? code;
          showToast({
            variant: "success",
            title: "Fuel surcharge updated from the carrier site",
            description: applied
              .map((r) => `${name(r.code)}: ${r.previousPercent}% to ${r.percent}%`)
              .join(", "),
          });
          onChanged?.();
        }
      })
      .catch((err) => setError(errorMessage(err, "Couldn't check the carrier sites.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refresh on open: one request, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (code: string) => rows?.find((row) => row.code === code)?.name ?? code;
  const daysSince = (iso: string) => Math.floor((checkedAt - new Date(iso).getTime()) / 86_400_000);

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
      onChanged?.();
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
              DHL&apos;s weekly figure is read from its site each time this page opens (and every
              morning at 6:30) and applied when it changes. UPS and FedEx refuse requests from
              servers: use &quot;Fuel and PSS from carrier page&quot; on the provider below to paste
              the page in, or enter the number.
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={isLoading} onClick={check}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {isLoading ? "Checking carrier sites…" : "Check again"}
          </Button>
        </div>

        {!isLoading && results.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {results.map((r) =>
              r.outcome === "APPLIED" ? (
                <li
                  key={r.code}
                  className="flex items-start gap-2 rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  <span>
                    <span className="font-medium">{nameOf(r.code)} fuel surcharge changed</span>{" "}
                    from {r.previousPercent}% to {r.percent}%
                    {r.label ? ` (${r.label})` : ""}, taken from the carrier&apos;s site just now. New
                    quotes use it.
                  </span>
                </li>
              ) : r.outcome === "HELD" ? (
                <li
                  key={r.code}
                  className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-sm text-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span>
                    <span className="font-medium">{nameOf(r.code)}</span>&apos;s site reads {r.percent}%
                    {r.label ? ` (${r.label})` : ""} against {r.previousPercent}% now. That is too large a
                    jump to apply on its own: open the page, check it, and apply it below.
                  </span>
                </li>
              ) : r.outcome === "UNCHANGED" ? (
                <li key={r.code} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  {nameOf(r.code)} is up to date at {r.percent}%{r.label ? ` (${r.label})` : ""}.
                </li>
              ) : null,
            )}
          </ul>
        )}

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && error && <ErrorState message={error} onRetry={check} />}

        {!isLoading &&
          !error &&
          rows?.map((row) => (
            <div key={row.rateProviderId} className="space-y-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{row.name}</span>
                <Badge variant="neutral">Now {row.configuredPercent}%</Badge>
                {!row.automatic &&
                  (row.history.length === 0 ? (
                    <Badge variant="warning">No update recorded</Badge>
                  ) : (
                    daysSince(row.history[0].createdAt) >= STALE_DAYS && (
                      <Badge variant="warning">
                        Last updated {daysSince(row.history[0].createdAt)} days ago
                      </Badge>
                    )
                  ))}
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
                      {update.source === "MANUAL"
                        ? "entered by hand"
                        : update.appliedByEmail
                        ? "from carrier site"
                        : "from carrier site, applied automatically"}
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
