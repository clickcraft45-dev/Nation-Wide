"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Copy, ExternalLink, Upload } from "lucide-react";
import type {
  ProviderRateSheetDto,
  RateGridCellDto,
  RateGridDto,
  RateProviderDto,
  RateSheetApplyResultDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

type Kind = "normal" | "allin";

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const kg = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * What to paste into ChatGPT with the carrier's raw sheet, so it comes back in the layout this
 * page reads: the same layout the provider's Export writes (exportRows in the backend's
 * rate-sheet-import.service.ts). Keep the two in step.
 */
export function conversionPrompt(provider: { code: string; name: string }): string {
  return [
    `I have a raw courier rate sheet from ${provider.name}. Convert it into one Excel file (.xlsx) I can download, laid out exactly like this:`,
    "",
    `Sheet name: ${provider.code}. Add " All in" to the end only if the prices already include fuel surcharge and GST.`,
    "",
    `1. A title row: "${provider.name} Package rates".`,
    `2. A header row: "Weight (kg)", then one column per zone, named as in my sheet (for example Zone 1, Zone 2, or A, B, C).`,
    "3. One row per weight. For a flat price, put the upper weight in kg in the first column (0.5, 1, 1.5 ...). For a price charged per kg over a range, write the range as from-to (for example 21-44) and put the per-kg price in the zone columns.",
    `4. An empty row, then the same block for documents with the title "${provider.name} Document rates", only if my sheet has document rates.`,
    `5. An empty row, then a header row "Country" | "Zone" and one row per country: the country name with its 2-letter ISO code in brackets, for example "United States (US)", and its zone.`,
    "",
    "Rules: prices are plain numbers in INR, no currency symbols or thousands separators. Weights are in kg (500 gms = 0.5). Weight bands must not overlap. Leave a cell empty when a zone has no price for that weight. Copy every price exactly, never estimate or round. After the file, list any rows you could not read.",
    "",
    "My raw rate sheet is attached.",
  ].join("\n");
}

/**
 * A provider's rates as the carrier's own sheet: pick the provider, see its live grid, upload the
 * new workbook, compare old and new cell by cell, apply. The file is sent again on apply, so
 * nothing is held on the server between the two steps.
 */
export function RateSheetImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [providers, setProviders] = useState<RateProviderDto[] | null>(null);
  const [providerId, setProviderId] = useState("");
  const [kind, setKind] = useState<Kind>("normal");
  const [sheet, setSheet] = useState<ProviderRateSheetDto | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Bumped to re-read the live rates (after apply, or to drop a comparison).
  const [reload, setReload] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<RateSheetApplyResultDto | null>(null);
  // The file the last apply came from: its comparison stays on screen as the record of what changed.
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then((list) => {
        setProviders(list);
        // ?provider= from a provider card's Import button.
        const wanted = new URLSearchParams(window.location.search).get("provider");
        setProviderId(
          (current) => current || list.find((p) => p.id === wanted)?.id || list[0]?.id || "",
        );
        if (list.length === 0) setIsLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err, "Couldn't load providers."));
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!providerId) return;
    let current = true;
    apiClient
      .get<ProviderRateSheetDto>(`/admin/pricing/providers/${providerId}/rate-sheet`)
      .then((live) => {
        if (!current) return;
        setSheet(live);
        setFile(null);
        setKind(live.grids.some((g) => g.allIn) ? "allin" : "normal");
      })
      .catch((err) => current && setError(errorMessage(err, "Couldn't load this provider's rates.")))
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
    };
  }, [providerId, reload]);

  function showLive() {
    setAppliedFrom(null);
    setIsLoading(true);
    setError(null);
    setReload((n) => n + 1);
  }

  function form(upload: File, as: Kind) {
    const body = new FormData();
    body.append("file", upload);
    body.append("allIn", String(as === "allin"));
    return body;
  }

  async function compare(upload: File, as: Kind) {
    setFile(upload);
    setApplied(null);
    setAppliedFrom(null);
    setError(null);
    setIsLoading(true);
    try {
      setSheet(
        await apiClient.postForm<ProviderRateSheetDto>(
          `/admin/pricing/providers/${providerId}/rate-sheet/preview`,
          form(upload, as),
        ),
      );
    } catch (err) {
      setFile(null);
      setError(errorMessage(err, "Couldn't read that workbook."));
    } finally {
      setIsLoading(false);
    }
  }

  async function apply() {
    if (!file) return;
    setIsApplying(true);
    setError(null);
    try {
      const result = await apiClient.postForm<RateSheetApplyResultDto>(
        `/admin/pricing/providers/${providerId}/rate-sheet/import`,
        form(file, kind),
      );
      setApplied(result);
      // The comparison on screen is exactly what was applied: keep it as the record, minus Apply.
      setAppliedFrom(file.name);
      setFile(null);
    } catch (err) {
      setError(errorMessage(err, "The update failed. Nothing was changed."));
    } finally {
      setIsApplying(false);
    }
  }

  const provider = providers?.find((p) => p.id === providerId);
  const comparing = Boolean(file && sheet?.compare);

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label="Rate sheet"
        onChange={(e) => {
          const next = e.target.files?.[0];
          e.target.value = "";
          if (next) void compare(next, kind);
        }}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="rate-sheet-provider">Provider</Label>
            <NativeSelect
              id="rate-sheet-provider"
              value={providerId}
              disabled={!providers || isApplying}
              onChange={(e) => {
                setFile(null);
                setSheet(null);
                setApplied(null);
                setAppliedFrom(null);
                setIsLoading(true);
                setProviderId(e.target.value);
              }}
            >
              {(providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isActive ? "" : " (off)"}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Sheet type
            </span>
            <SegmentedControl<Kind>
              ariaLabel="Sheet type"
              value={kind}
              onChange={(next) => {
                setKind(next);
                // The same file read the other way round: the comparison has to follow.
                if (file) void compare(file, next);
              }}
              options={[
                { value: "normal", label: "Normal" },
                { value: "allin", label: "All-in" },
              ]}
            />
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            {comparing ? (
              <>
                <Button variant="secondary" disabled={isApplying} onClick={showLive}>
                  Cancel
                </Button>
                <Button onClick={() => apply()} isLoading={isApplying} disabled={isLoading}>
                  Apply to {provider?.name ?? "provider"}
                </Button>
              </>
            ) : (
              <>
                {appliedFrom && (
                  <Button variant="secondary" onClick={showLive}>
                    Show live grid
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setCopied(false);
                    setPromptOpen(true);
                  }}
                  disabled={!providerId || isLoading}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  Import new sheet
                </Button>
              </>
            )}
          </div>

          <p className="w-full text-xs text-muted-foreground">
            {kind === "allin"
              ? "All-in: the sheet's prices already include fuel and GST. Nothing is added on top except your margin."
              : "Normal: the sheet's prices are before fuel and GST. Fuel, PSS and 18% GST are added at quote time."}
          </p>
        </CardContent>
      </Card>

      {provider && (
        <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
          <DialogContent
            className="max-w-xl"
            title={`Import ${provider.name} rates`}
            description="Carrier sheets come in every shape. Paste this prompt into ChatGPT with the raw sheet attached, download the .xlsx it returns, then choose that file here."
          >
            <div className="space-y-3">
              <textarea
                readOnly
                aria-label="ChatGPT prompt"
                value={conversionPrompt(provider)}
                onFocus={(e) => e.currentTarget.select()}
                className="glass-field h-56 w-full resize-none rounded-lg p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(conversionPrompt(provider));
                    setCopied(true);
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  {copied ? "Copied" : "Copy prompt"}
                </Button>
                <a
                  href={`https://chatgpt.com/?q=${encodeURIComponent(conversionPrompt(provider))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open ChatGPT
                </a>
                <Button
                  className="sm:ml-auto"
                  onClick={() => {
                    setPromptOpen(false);
                    inputRef.current?.click();
                  }}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  Choose .xlsx file
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Already have the file in this layout, or exported it from here? Choose it directly. Nothing changes until you press Apply.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {error && <FieldError>{error}</FieldError>}

      {applied && (
        <div className="flex items-start gap-2 rounded-xl border border-success-border bg-success-bg p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {provider?.name} rates updated: {applied.bandsUpdated} changed, {applied.bandsCreated} added,{" "}
            {applied.bandsDeactivated} removed. These rates are live now; the grid below shows what changed.
          </span>
        </div>
      )}

      {isLoading && !sheet ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading rates">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : sheet ? (
        <SheetView
          sheet={sheet}
          heading={appliedFrom ? `Applied ${appliedFrom}: changes from the previous rates` : `Comparing ${file?.name ?? ""}`}
          busy={isLoading}
        />
      ) : null}
    </div>
  );
}

function SheetView({ sheet, heading, busy }: { sheet: ProviderRateSheetDto; heading: string; busy: boolean }) {
  const [type, setType] = useState<RateGridDto["shipmentType"]>("PACKAGE");
  const [changesOnly, setChangesOnly] = useState(false);
  const grid = sheet.grids.find((g) => g.shipmentType === type) ?? sheet.grids[0];
  const s = sheet.summary;

  if (sheet.grids.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No rates for {sheet.providerName} yet. Upload their sheet to fill this in.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-3 transition-opacity", busy && "opacity-60")} aria-busy={busy}>
      {sheet.compare && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-foreground">{heading}</span>
          <span className="text-muted-foreground">
            <b className="text-foreground">{s.changed}</b> changed · <b className="text-foreground">{s.added}</b> new ·{" "}
            <b className="text-foreground">{s.removed}</b> removed · {s.unchanged} same
          </span>
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="rounded bg-danger-bg px-1.5 py-0.5 text-danger line-through">old rate</span>
            <span className="rounded bg-success-bg px-1.5 py-0.5 text-success">new rate</span>
          </span>
          {sheet.sources.length > 0 && (
            <span className="text-xs text-muted-foreground">Read from {sheet.sources.join("; ")}</span>
          )}
        </div>
      )}

      {sheet.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning">
          {sheet.warnings.map((w, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {sheet.grids.length > 1 && (
          <SegmentedControl<RateGridDto["shipmentType"]>
            ariaLabel="Shipment type"
            value={grid.shipmentType}
            onChange={setType}
            options={sheet.grids.map((g) => ({
              value: g.shipmentType,
              label: g.shipmentType === "PACKAGE" ? "Package" : "Document",
            }))}
          />
        )}
        <Badge variant="neutral">
          {grid.allIn ? "All-in rates" : "Normal rates"}
          {sheet.compare && grid.allIn !== grid.wasAllIn && ` (was ${grid.wasAllIn ? "all-in" : "normal"})`}
        </Badge>
        {sheet.compare && (
          <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(e) => setChangesOnly(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            Changed rows only
          </label>
        )}
      </div>

      <Grid grid={grid} compare={sheet.compare} changesOnly={changesOnly} />
    </div>
  );
}

function Grid({ grid, compare, changesOnly }: { grid: RateGridDto; compare: boolean; changesOnly: boolean }) {
  const rows = useMemo(
    () => (changesOnly ? grid.rows.filter((r) => r.cells.some((c) => c.changed)) : grid.rows),
    [grid, changesOnly],
  );
  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl border border-border bg-white">
      <table className="w-max min-w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-20 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
            >
              Weight (kg)
            </th>
            {grid.columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="sticky top-0 z-10 max-w-40 truncate border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground"
                title={col}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={grid.columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                No changes in this grid.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.fromKg}-${row.toKg}`} className="hover:bg-muted/40">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground"
                >
                  {kg(row.fromKg)} – {kg(row.toKg)}
                </th>
                {row.cells.map((cell, i) => (
                  <Cell key={i} cell={cell} compare={compare} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell, compare }: { cell: RateGridCellDto; compare: boolean }) {
  const perKg = cell.perKg && <span className="ml-0.5 text-[10px] text-muted-foreground">/kg</span>;
  const base = "whitespace-nowrap border-b border-border px-3 py-1.5";

  if (!compare || !cell.changed) {
    const value = compare ? cell.new : cell.old;
    return (
      <td className={cn(base, compare && "text-muted-foreground")}>
        {value === null ? <span className="text-muted-foreground/50">·</span> : <>{num(value)}{perKg}</>}
      </td>
    );
  }

  if (cell.new === null) {
    return (
      <td className={cn(base, "bg-danger-bg")} title="Not in the new sheet: this band is switched off">
        <span className="text-danger line-through">{num(cell.old!)}</span>
        <span className="sr-only"> removed</span>
      </td>
    );
  }

  const up = cell.old !== null && cell.new > cell.old;
  const down = cell.old !== null && cell.new < cell.old;
  return (
    // GitHub-style: the old rate struck through on red above, the new rate on green below.
    <td className={cn(base, "p-0")} title={cell.old === null ? "New band" : `Was ${num(cell.old)}`}>
      {cell.old !== null && (
        <span className="block bg-danger-bg px-3 pt-1 text-[11px] text-danger line-through">
          <span className="sr-only">was </span>
          {num(cell.old)}
        </span>
      )}
      <span className="flex items-center justify-end gap-1 bg-success-bg px-3 py-1 font-semibold text-success">
        {up && <ArrowUp className="h-3 w-3" aria-label="up" />}
        {down && <ArrowDown className="h-3 w-3" aria-label="down" />}
        {cell.old === null && <span className="text-[11px] font-normal">new</span>}
        {num(cell.new)}
        {perKg}
      </span>
    </td>
  );
}
