"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import type {
  RateCardCountryOptionDto,
  RateCardDocumentDto,
  RateProviderDto,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { downloadBlob } from "@/lib/utils/download-blob";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { NativeSelect } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/page-state";
import { CompanySettingsDialog } from "./company-settings-dialog";

const SHIPMENT_TYPE_OPTIONS: { value: ShipmentTypeCode; label: string }[] = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SelectedCountry {
  countryId: string;
  name: string;
  transitTime: string;
}

export function RateCardsTab() {
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [availableCountries, setAvailableCountries] = useState<RateCardCountryOptionDto[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [selected, setSelected] = useState<SelectedCountry[]>([]);

  const [rateProviderId, setRateProviderId] = useState("");
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  // Starts empty rather than todayIso() so the server-rendered markup (this page is statically
  // generated) matches the client's first render exactly — filled in after mount, see
  // use-current-year.ts for the same pattern.
  const [effectiveDate, setEffectiveDate] = useState("");

  const [recent, setRecent] = useState<RateCardDocumentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    // One-shot lookup, not a subscription.
    apiClient.get<RateProviderDto[]>("/admin/rate-providers").then((p) => setProviders(p.filter((x) => x.isActive)));
    loadRecent();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEffectiveDate(todayIso());
  }, []);

  function loadRecent() {
    apiClient
      .get<RateCardDocumentDto[]>("/admin/rate-cards")
      .then((docs) => setRecent(docs.slice(0, 5)))
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!rateProviderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvailableCountries([]);
      setSelected([]);
      return;
    }
    // Switching providers invalidates any in-progress selection — a country's pricing is
    // provider-specific, so a previously-checked country may not even exist under the new one.
    setSelected([]);
    apiClient
      .get<RateCardCountryOptionDto[]>(`/admin/rate-cards/countries?rateProviderId=${rateProviderId}`)
      .then(setAvailableCountries);
  }, [rateProviderId]);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return availableCountries;
    return availableCountries.filter((c) => c.name.toLowerCase().includes(q));
  }, [availableCountries, countrySearch]);

  function toggleCountry(country: RateCardCountryOptionDto) {
    setSelected((prev) => {
      const exists = prev.find((c) => c.countryId === country.id);
      if (exists) return prev.filter((c) => c.countryId !== country.id);
      return [...prev, { countryId: country.id, name: country.name, transitTime: "" }];
    });
  }

  function setTransitTime(countryId: string, transitTime: string) {
    setSelected((prev) =>
      prev.map((c) => (c.countryId === countryId ? { ...c, transitTime } : c)),
    );
  }

  async function handleDownload(doc: RateCardDocumentDto) {
    try {
      // A plain <a href> to this endpoint would 401 — it needs the Bearer token apiClient
      // attaches, which a raw browser navigation never sends.
      const { blob } = await apiClient.getBlob(`/admin/rate-cards/${doc.id}/download`);
      downloadBlob(blob, `RateCard-v${doc.version}.pdf`);
    } catch {
      showToast({ variant: "error", title: "Couldn't download the rate card." });
    }
  }

  function validate(): string | null {
    if (!rateProviderId) return "Select a provider.";
    if (selected.length === 0) return "Select at least one country.";
    if (!effectiveDate) return "Select an effective date.";
    return null;
  }

  function buildPayload() {
    return {
      rateProviderId,
      shipmentType,
      countries: selected.map((c) => ({
        countryId: c.countryId,
        transitTime: c.transitTime.trim() || undefined,
      })),
      effectiveDate,
      templateKey: "CLASSIC" as const,
    };
  }

  async function handlePreview() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsPreviewing(true);
    try {
      const { blob } = await apiClient.postBlob("/admin/rate-cards/preview", buildPayload());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError("Couldn't generate a preview. Check the pricing engine has active rates for this selection.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleGenerate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const { blob, headers } = await apiClient.postBlob("/admin/rate-cards", buildPayload());
      const version = headers.get("X-Rate-Card-Version");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rate-card-v${version ?? ""}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      showToast({ variant: "success", title: `Rate card generated (v${version})` });
      loadRecent();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? "Couldn't generate the rate card. Check the pricing engine has active rates for this selection."
          : "Something went wrong.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Generate a Rate Card</h2>
          <CompanySettingsDialog trigger={<Button variant="ghost" size="sm">Rate Card Settings</Button>} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rc-provider">Provider</Label>
          <NativeSelect
            id="rc-provider"
            value={rateProviderId}
            onChange={(e) => setRateProviderId(e.target.value)}
          >
            <option value="">Select a provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rc-shipment-type">Shipment Type</Label>
          <NativeSelect
            id="rc-shipment-type"
            value={shipmentType}
            onChange={(e) => setShipmentType(e.target.value as ShipmentTypeCode)}
          >
            {SHIPMENT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label>Countries</Label>
          <SearchInput
            placeholder={rateProviderId ? "Search countries…" : "Select a provider first…"}
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            disabled={!rateProviderId}
            aria-label="Search countries"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {filteredCountries.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                {rateProviderId ? "No countries found." : "Select a provider to see its countries."}
              </p>
            ) : (
              filteredCountries.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selected.some((s) => s.countryId === c.id)}
                    onChange={() => toggleCountry(c)}
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="space-y-1.5">
            <Label>Transit Time per Country (optional)</Label>
            <div className="space-y-1.5">
              {selected.map((c) => (
                <div key={c.countryId} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{c.name}</span>
                  <Input
                    placeholder="e.g. 4-5 Working Days"
                    value={c.transitTime}
                    onChange={(e) => setTransitTime(c.countryId, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="rc-date">Effective From</Label>
          <DateField
            id="rc-date"
            title="Effective from"
            subtitle="Date this rate card takes over"
            value={effectiveDate}
            onChange={setEffectiveDate}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rc-template">Template</Label>
          <NativeSelect id="rc-template" value="CLASSIC" disabled>
            <option value="CLASSIC">Classic</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">More templates coming soon.</p>
        </div>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={handlePreview} isLoading={isPreviewing}>
            Preview
          </Button>
          <Button size="sm" onClick={handleGenerate} isLoading={isGenerating}>
            Generate & Download
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recently Generated</h2>
        {recent.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" aria-hidden />}
            title="No rate cards generated yet"
            description="Fill in the form and click Generate & Download to create your first one."
          />
        ) : (
          <ul className="space-y-2">
            {recent.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">v{doc.version}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.countryNames.join(", ")} · Effective {doc.effectiveDate}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(previewUrl)}
        onOpenChange={(next) => {
          if (!next && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }}
      >
        {previewUrl && (
          <DialogContent title="Rate Card Preview" className="max-w-4xl">
            <iframe src={previewUrl} title="Rate card preview" className="h-[70vh] w-full rounded border border-border" />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
