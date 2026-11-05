"use client";

import { useId, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { surchargePagesFor } from "@/lib/carrier-surcharge-pages";
import { MAX_PASTE, readPastedSurcharges, type SurchargeCandidate } from "@/lib/surcharge-paste";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Update fuel and PSS from the carrier's own page, for carriers whose site refuses the server.
 *
 * The admin opens the page in their browser, copies it all and pastes it here. Every figure found
 * is listed with the line it came from; nothing changes until one is applied, and a fuel figure is
 * recorded as "from carrier site" in the last-five history like DHL's automatic one.
 */
export function SurchargePasteReader({
  provider,
  onApplied,
}: {
  provider: { id: string; code: string; name: string; fuelChargePercent: number; pssPerKg: number };
  onApplied: () => void;
}) {
  const textId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();
  const pages = surchargePagesFor(provider.code);
  const found = useMemo(() => (text.trim() ? readPastedSurcharges(text) : null), [text]);

  async function applyFuel(c: SurchargeCandidate) {
    setBusy(`f${c.value}${c.context}`);
    try {
      await apiClient.post(`/admin/rate-providers/${provider.id}/fuel-surcharge`, {
        percent: c.value,
        source: "CARRIER_SITE",
        label: `Pasted: ${c.context}`.slice(0, 120),
      });
      showToast({ variant: "success", title: `${provider.name} fuel surcharge set to ${c.value}%` });
      onApplied();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't apply that surcharge.") });
    } finally {
      setBusy(null);
    }
  }

  async function applyPss(c: SurchargeCandidate) {
    setBusy(`p${c.value}${c.context}`);
    try {
      await apiClient.patch(`/admin/rate-providers/${provider.id}`, {
        pssPerKg: c.value,
        reason: `From the carrier page: ${c.context}`.slice(0, 200),
      });
      showToast({ variant: "success", title: `${provider.name} PSS set to ₹${c.value} per kg` });
      onApplied();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't apply that PSS.") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Open {provider.name}&apos;s page in this browser
          {pages && (
            <>
              {": "}
              <PageLink href={pages.fuel}>fuel surcharge</PageLink>
              {", "}
              <PageLink href={pages.pss}>PSS (peak / demand)</PageLink>
            </>
          )}
          .
        </li>
        <li>Press Ctrl+A, then Ctrl+C on that page (Cmd on a Mac).</li>
        <li>Paste it below, check the line the figure came from, and apply it.</li>
      </ol>

      <div className="space-y-1.5">
        <Label htmlFor={textId}>Pasted page</Label>
        <textarea
          id={textId}
          value={text}
          maxLength={MAX_PASTE}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Paste the carrier's page here"
          className="glass-field w-full rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {found && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Candidates
            title={`Fuel surcharge (now ${provider.fuelChargePercent}%)`}
            empty="No percentages on this page. Is it the fuel surcharge page?"
            items={found.fuel}
            format={(v) => `${v}%`}
            current={provider.fuelChargePercent}
            busy={busy}
            busyKey="f"
            onApply={applyFuel}
          />
          <Candidates
            title={`PSS per kg (now ₹${provider.pssPerKg})`}
            empty={
              found.foreignPerKg > 0
                ? `Found ${found.foreignPerKg} per-kg figure${found.foreignPerKg > 1 ? "s" : ""} in another currency. PSS is kept in rupees: convert it and set it by hand.`
                : "No rupee per-kg surcharge on this page. Is it the peak / demand surcharge page?"
            }
            items={found.pss}
            format={(v) => `₹${v} / kg`}
            current={provider.pssPerKg}
            busy={busy}
            busyKey="p"
            onApply={applyPss}
          />
        </div>
      )}
    </div>
  );
}

function Candidates({
  title,
  empty,
  items,
  format,
  current,
  busy,
  busyKey,
  onApply,
}: {
  title: string;
  empty: string;
  items: SurchargeCandidate[];
  format: (v: number) => string;
  current: number;
  busy: string | null;
  busyKey: string;
  onApply: (c: SurchargeCandidate) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {items.map((c) => (
            <li
              key={`${c.value}|${c.context}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                c.suggested ? "border-foreground/40 bg-muted/60" : "border-border",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {format(c.value)}
                  {c.suggested && <span className="ml-2 text-xs font-normal text-muted-foreground">Likely the one</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={c.context}>
                  {c.context}
                </p>
              </div>
              <Button
                size="sm"
                variant={c.suggested ? "primary" : "secondary"}
                disabled={c.value === current || busy !== null}
                isLoading={busy === `${busyKey}${c.value}${c.context}`}
                onClick={() => onApply(c)}
              >
                {c.value === current ? "Current" : "Apply"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}
