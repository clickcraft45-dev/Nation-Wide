"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ProviderCountryDto, RateProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { MarginBandsDialog } from "@/components/pricing/margin-bands-dialog";
import { RateSheetImport } from "@/components/pricing/rate-sheet-import";
import { SurchargePasteReader } from "@/components/pricing/surcharge-paste-reader";

const STEPS = [
  { label: "Carrier", description: "Code and name" },
  { label: "Charges", description: "Fuel and PSS" },
  { label: "Rates", description: "Countries, zones, prices" },
  { label: "Margins", description: "NationWide cut" },
  { label: "Review", description: "Turn it on" },
];

/**
 * Onboarding a carrier, start to finish: nothing is left as "add later" by accident.
 *
 * The provider is created switched off at the first step, so a half-finished carrier never prices
 * a quote, and is only turned on at Review once it has countries and prices. The provider and
 * step live in the address (?id=&step=), so a refresh or a second visit carries on from there.
 */
export default function NewProviderPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<RateProviderDto | null>(null);
  const [countries, setCountries] = useState<ProviderCountryDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const go = useCallback((next: number, id = provider?.id) => {
    setStep(next);
    if (id) window.history.replaceState(null, "", `?id=${id}&step=${next}`);
  }, [provider?.id]);

  const refresh = useCallback(async (id: string) => {
    const [p, c] = await Promise.all([
      apiClient.get<RateProviderDto>(`/admin/rate-providers/${id}`),
      apiClient.get<ProviderCountryDto[]>(`/admin/rate-providers/${id}/countries`),
    ]);
    setProvider(p);
    setCountries(c);
    return p;
  }, []);

  // Resume an onboarding in progress.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }
    refresh(id)
      .then(() => setStep(Math.min(Math.max(Number(params.get("step")) || 1, 1), STEPS.length - 1)))
      .catch(() => showToast({ variant: "error", title: "Couldn't load that provider. Start again." }))
      .finally(() => setIsLoading(false));
  }, [refresh, showToast]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <BackLink href="/admin/pricing/providers">Back to providers</BackLink>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Add a provider</h1>
        <p className="text-sm text-muted-foreground">
          Every detail a carrier needs before it can price a shipment. It stays switched off until
          the last step.
        </p>
      </div>

      <Stepper steps={STEPS} currentIndex={step} />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {step === 0 && (
            <CarrierStep
              provider={provider}
              onSaved={(p) => {
                setProvider(p);
                setCountries((c) => c ?? []);
                go(1, p.id);
              }}
            />
          )}
          {step === 1 && provider && (
            <ChargesStep
              provider={provider}
              onRefresh={() => void refresh(provider.id)}
              onBack={() => go(0)}
              onNext={() => go(2)}
            />
          )}
          {step === 2 && provider && (
            <RatesStep
              provider={provider}
              countries={countries ?? []}
              onApplied={() => void refresh(provider.id)}
              onBack={() => go(1)}
              onNext={() => go(3)}
            />
          )}
          {step === 3 && provider && (
            <MarginsStep
              provider={provider}
              onRefresh={() => void refresh(provider.id)}
              onBack={() => go(2)}
              onNext={() => go(4)}
            />
          )}
          {step === 4 && provider && (
            <ReviewStep
              provider={provider}
              countries={countries ?? []}
              onEdit={go}
              onLive={() => router.push(`/admin/pricing/providers/${provider.id}`)}
            />
          )}
        </>
      )}
    </div>
  );
}

function StepCard({
  title,
  hint,
  children,
  footer,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        {children}
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">{footer}</div>
      </CardContent>
    </Card>
  );
}

function CarrierStep({
  provider,
  onSaved,
}: {
  provider: RateProviderDto | null;
  onSaved: (p: RateProviderDto) => void;
}) {
  const [code, setCode] = useState(provider?.code ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
      setError("Code is 2 to 32 capital letters, digits or underscores, e.g. FEDEX or DHL_EXPRESS.");
      return;
    }
    if (!name.trim()) {
      setError("Enter the carrier's name as customers should see it.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      let saved: RateProviderDto;
      if (provider) {
        saved = await apiClient.patch<RateProviderDto>(`/admin/rate-providers/${provider.id}`, { name: name.trim() });
      } else {
        const created = await apiClient.post<RateProviderDto>("/admin/rate-providers", { code, name: name.trim() });
        // Off until Review: a carrier without prices must never reach a customer's quote.
        saved = await apiClient.patch<RateProviderDto>(`/admin/rate-providers/${created.id}`, { isActive: false });
      }
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the provider. Is that code already used?"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <StepCard
        title="Which carrier?"
        hint="The code is how rate sheets and tracking links find this carrier, and can't change later."
        footer={
          <>
            <span />
            <Button type="submit" isLoading={isSaving}>
              {provider ? "Save and continue" : "Create and continue"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-provider-code">Code</Label>
            <Input
              id="new-provider-code"
              placeholder="e.g. ARAMEX"
              value={code}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              disabled={Boolean(provider)}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-provider-name">Name customers see</Label>
            <Input
              id="new-provider-name"
              placeholder="e.g. Aramex"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </StepCard>
    </form>
  );
}

function ChargesStep({
  provider,
  onRefresh,
  onBack,
  onNext,
}: {
  provider: RateProviderDto;
  onRefresh: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [fuel, setFuel] = useState(String(provider.fuelChargePercent));
  const [pss, setPss] = useState(String(provider.pssPerKg));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // A figure applied from the pasted page lands on the provider: show it in the boxes too.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFuel(String(provider.fuelChargePercent));
    setPss(String(provider.pssPerKg));
  }, [provider.fuelChargePercent, provider.pssPerKg]);

  async function save() {
    const f = Number(fuel);
    const p = Number(pss);
    if (!(f >= 0 && f <= 100) || !(p >= 0 && p <= 10_000) || fuel === "" || pss === "") {
      setError("Fuel is a percentage from 0 to 100; PSS is rupees per kg, 0 when the carrier has none.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await apiClient.patch(`/admin/rate-providers/${provider.id}`, {
        fuelChargePercent: f,
        pssPerKg: p,
        reason: "Set while onboarding the provider",
      });
      onRefresh();
      onNext();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the charges."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <StepCard
      title="Fuel surcharge and PSS"
      hint="Both apply to every quote for this carrier: fuel as a percentage of the base rate, PSS as rupees per kg."
      footer={
        <>
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <Button onClick={save} isLoading={isSaving}>Save and continue</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-provider-fuel">Fuel surcharge (%)</Label>
          <Input id="new-provider-fuel" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={fuel} onChange={(e) => setFuel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-provider-pss">PSS (₹ per kg)</Label>
          <Input id="new-provider-pss" type="number" inputMode="decimal" min="0" step="0.01" value={pss} onChange={(e) => setPss(e.target.value)} />
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Or read them from the carrier&apos;s website</p>
        
        <SurchargePasteReader provider={provider} onApplied={onRefresh} />
      </div>
    </StepCard>
  );
}

function RatesStep({
  provider,
  countries,
  onApplied,
  onBack,
  onNext,
}: {
  provider: RateProviderDto;
  countries: ProviderCountryDto[];
  onApplied: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const zones = useMemo(() => zoneSummary(countries), [countries]);
  return (
    <StepCard
      title="Countries, zones and prices"
      hint="Upload the carrier's rate sheet. The preview shows every zone with its weight bands and prices, and the countries in each zone; nothing is saved until you apply it. Use the prompt in the import to turn a carrier's PDF or odd sheet into the right layout."
      footer={
        <>
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <div className="flex flex-wrap items-center gap-3">
            {countries.length === 0 && (
              <span className="text-xs text-muted-foreground">Apply a sheet to continue, or add rates later from the provider page.</span>
            )}
            {countries.length === 0 && <Button variant="secondary" onClick={onNext}>Skip for now</Button>}
            <Button onClick={onNext} disabled={countries.length === 0}>Continue</Button>
          </div>
        </>
      }
    >
      <RateSheetImport providerId={provider.id} onApplied={onApplied} />
      {countries.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          {provider.name} now has {zones.length} zone{zones.length === 1 ? "" : "s"} covering {countries.length} destination
          {countries.length === 1 ? "" : "s"}.
        </p>
      )}
    </StepCard>
  );
}

function MarginsStep({
  provider,
  onRefresh,
  onBack,
  onNext,
}: {
  provider: RateProviderDto;
  onRefresh: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <StepCard
      title="NationWide margin"
      hint="The cut added to this carrier's price by weight band. A rate that carries its own margin in the sheet keeps it."
      footer={
        <>
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <Button onClick={onNext}>Continue</Button>
        </>
      }
    >
      {provider.marginBands.length === 0 ? (
        <p className="text-sm text-muted-foreground">No margin bands yet: quotes would charge the carrier&apos;s price with no NationWide cut.</p>
      ) : (
        <ul className="space-y-1 text-sm text-foreground">
          {provider.marginBands.map((band) => (
            <li key={band.id} className="tabular-nums">
              {band.fromKg}–{band.toKg ?? "∞"} kg: ₹{band.flatAmount.toLocaleString("en-IN")}
              {band.perKgAmount > 0 ? ` + ₹${band.perKgAmount}/kg` : ""}
            </li>
          ))}
        </ul>
      )}
      <MarginBandsDialog
        provider={provider}
        onSaved={onRefresh}
        trigger={<Button variant="secondary">{provider.marginBands.length ? "Edit margin bands" : "Set margin bands"}</Button>}
      />
    </StepCard>
  );
}

function ReviewStep({
  provider,
  countries,
  onEdit,
  onLive,
}: {
  provider: RateProviderDto;
  countries: ProviderCountryDto[];
  onEdit: (step: number) => void;
  onLive: () => void;
}) {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const zones = useMemo(() => zoneSummary(countries), [countries]);
  const unpriced = countries.filter((c) => c.weightSlabCount === 0).length;

  const checks: { ok: boolean; warn?: boolean; label: string; detail: string; step: number }[] = [
    { ok: true, label: "Carrier", detail: `${provider.name} (${provider.code})`, step: 0 },
    { ok: true, warn: provider.fuelChargePercent === 0, label: "Fuel surcharge", detail: provider.fuelChargePercent === 0 ? "0%: check the carrier really charges none" : `${provider.fuelChargePercent}%`, step: 1 },
    { ok: true, label: "PSS", detail: provider.pssPerKg === 0 ? "None" : `₹${provider.pssPerKg} per kg`, step: 1 },
    {
      ok: countries.length > 0,
      warn: unpriced > 0,
      label: "Zones and countries",
      detail: !countries.length
        ? "No rates yet"
        : `${zones.length} zones, ${countries.length} destinations, ${unpriced ? `${unpriced} without prices` : "every one priced"}`,
      step: 2,
    },
    { ok: true, warn: provider.marginBands.length === 0, label: "Margin", detail: provider.marginBands.length ? `${provider.marginBands.length} band${provider.marginBands.length > 1 ? "s" : ""}` : "None: quotes carry no NationWide cut", step: 3 },
  ];
  const ready = checks.every((c) => c.ok);

  async function goLive() {
    setIsSaving(true);
    try {
      await apiClient.patch(`/admin/rate-providers/${provider.id}`, { isActive: true });
      showToast({ variant: "success", title: `${provider.name} is now quoting` });
      onLive();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't turn the provider on.") });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <StepCard
      title="Review and turn on"
      hint="Once on, this carrier is offered on every quote whose destination it covers."
      footer={
        <>
          <Button variant="secondary" onClick={() => onEdit(3)}>Back</Button>
          <div className="flex flex-wrap items-center gap-3">
            {!ready && <span className="text-xs text-muted-foreground">Add rates before turning it on.</span>}
            <Button variant="secondary" onClick={onLive}>Leave it off</Button>
            <Button onClick={goLive} disabled={!ready} isLoading={isSaving}>Turn on for quotes</Button>
          </div>
        </>
      }
    >
      <dl className="divide-y divide-border rounded-xl border border-border">
        {checks.map((c) => (
          <div key={c.label} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {c.ok && !c.warn ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Done" />
            ) : (
              <AlertTriangle className={c.ok ? "h-4 w-4 shrink-0 text-warning" : "h-4 w-4 shrink-0 text-danger"} aria-label={c.ok ? "Check" : "Missing"} />
            )}
            <dt className="w-40 text-sm font-medium text-foreground">{c.label}</dt>
            <dd className="min-w-0 flex-1 text-sm text-muted-foreground">{c.detail}</dd>
            <Button size="sm" variant="secondary" onClick={() => onEdit(c.step)}>Edit</Button>
          </div>
        ))}
      </dl>

      {zones.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Countries by zone</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {zones.map((z) => (
              <details key={z.name} className="rounded-lg border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm text-foreground">
                  {z.name} <span className="text-muted-foreground">· {z.countries.length}</span>
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{z.countries.join(", ")}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </StepCard>
  );
}

function zoneSummary(countries: ProviderCountryDto[]): { name: string; countries: string[] }[] {
  const byZone = new Map<string, string[]>();
  for (const c of countries) byZone.set(c.zoneName, [...(byZone.get(c.zoneName) ?? []), c.countryName]);
  return [...byZone]
    .map(([name, list]) => ({ name, countries: list.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
