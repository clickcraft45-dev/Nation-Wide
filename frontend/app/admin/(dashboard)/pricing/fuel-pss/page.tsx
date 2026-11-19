"use client";

import { useEffect, useState } from "react";
import { Fuel } from "lucide-react";
import type { RateProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";
import { FuelSurchargePanel } from "@/components/pricing/fuel-surcharge-panel";
import { MarginBandsDialog } from "@/components/pricing/margin-bands-dialog";
import { BackLink } from "@/components/ui/back-link";
import { CancellationChargesCard } from "@/components/pricing/cancellation-charges-card";
import { SurchargePasteReader } from "@/components/pricing/surcharge-paste-reader";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Fuel Charge % and PSS/kg live once per provider (RateProvider), not per rate — updating either
// here affects every shipment quoted for that provider immediately, with no duplicate values
// hiding inside individual rate records.
export default function FuelAndPssPage() {
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The provider whose carrier page is being read, when the paste dialog is open.
  const [reading, setReading] = useState<RateProviderDto | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then(setProviders)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load providers."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // ?section=cancellation (the overview's tile): scroll <main>, the shell's scroll container, once
  // the provider cards above have loaded and stopped moving the card down. scrollIntoView would
  // also scroll the fixed shell itself and leave a gap under it.
  useEffect(() => {
    if (isLoading || new URLSearchParams(window.location.search).get("section") !== "cancellation") return;
    const card = document.getElementById("cancellation");
    const main = card?.closest("main");
    if (!card || !main) return;
    main.scrollTo({
      top: main.scrollTop + card.getBoundingClientRect().top - main.getBoundingClientRect().top - 24,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [isLoading]);

  return (
    <div className="space-y-4">
      <BackLink href="/admin/pricing/dashboard">Back to pricing</BackLink>
      <h1 className="text-xl font-semibold text-foreground">Charges and margins</h1>
      <p className="text-sm text-muted-foreground">
        Fuel Charge % applies to Base Rate only; PSS is a flat rate per kg. Margin bands set the
        NationWide cut by weight. A rate that carries its own margin keeps it. All three apply
        automatically to every quote for that provider.
      </p>

      <FuelSurchargePanel />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && providers.length === 0 && (
        <EmptyState icon={<Fuel className="h-8 w-8" aria-hidden />} title="No providers yet" />
      )}

      {!isLoading && !error && providers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between">
                  <p className="text-base font-semibold text-foreground">{p.name}</p>
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Fuel Charge</dt>
                  <dd className="text-right text-foreground">{p.fuelChargePercent}%</dd>
                  <dt className="text-muted-foreground">PSS</dt>
                  <dd className="text-right text-foreground">₹{p.pssPerKg} / kg</dd>
                  <dt className="text-muted-foreground">Margin</dt>
                  <dd className="text-right text-foreground">
                    {p.marginBands.length === 0
                      ? "Per rate"
                      : `${p.marginBands.length} band${p.marginBands.length > 1 ? "s" : ""}`}
                  </dd>
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="text-right text-foreground">
                    {new Date(p.updatedAt).toLocaleDateString("en-IN")}
                  </dd>
                </dl>
                {p.marginBands.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {p.marginBands.map((band) => (
                      <li key={band.id}>
                        {band.fromKg}–{band.toKg ?? "∞"} kg: ₹{band.flatAmount.toLocaleString("en-IN")}
                        {band.perKgAmount > 0 ? ` + ₹${band.perKgAmount}/kg` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <RateProviderDialog
                    provider={p}
                    onSaved={() => load()}
                    trigger={
                      <Button size="sm" className="w-full">
                        Update
                      </Button>
                    }
                  />
                  <MarginBandsDialog
                    provider={p}
                    onSaved={() => load()}
                    trigger={
                      <Button size="sm" variant="secondary" className="w-full">
                        Margins
                      </Button>
                    }
                  />
                </div>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => setReading(p)}>
                  Fuel and PSS from carrier page
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reading !== null} onOpenChange={(open) => !open && setReading(null)}>
        {reading && (
          <DialogContent
            title={`${reading.name}: fuel and PSS from its page`}
            description="For carriers whose site can't be read by the server. Nothing changes until you apply a figure."
            className="max-w-3xl"
          >
            <SurchargePasteReader
              provider={providers.find((p) => p.id === reading.id) ?? reading}
              onApplied={load}
            />
          </DialogContent>
        )}
      </Dialog>

      <div id="cancellation" className="scroll-mt-20">
        <CancellationChargesCard />
      </div>
    </div>
  );
}
