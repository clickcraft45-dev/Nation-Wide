"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CountryDto, ProviderCountryDto, RateProviderDto, ZoneDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const NEW = "__new";

/**
 * Adds a country to a provider in one step: provider, the zone it is priced in, the country. A
 * country is priced through its zone, so this is everything a country needs to get a quote once
 * that zone has rates. A zone or country that doesn't exist yet can be created right here.
 */
export function AddCountryDialog({
  trigger,
  providerId: fixedProviderId,
  onSaved,
}: {
  trigger: ReactNode;
  /** Set when opened from a provider's own page: the provider is then not a choice. */
  providerId?: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [linked, setLinked] = useState<ProviderCountryDto[]>([]);
  const [providerId, setProviderId] = useState(fixedProviderId ?? "");
  const [zoneId, setZoneId] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiClient.get<RateProviderDto[]>("/admin/rate-providers"),
      apiClient.get<CountryDto[]>("/admin/countries"),
    ])
      .then(([p, c]) => {
        setProviders(p);
        setCountries(c);
        setProviderId((current) => current || p[0]?.id || "");
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load providers and countries.")));
  }, [open]);

  useEffect(() => {
    if (!open || !providerId) return;
    Promise.all([
      apiClient.get<ZoneDto[]>(`/admin/zones?rateProviderId=${providerId}`),
      apiClient.get<ProviderCountryDto[]>(`/admin/rate-providers/${providerId}/countries`),
    ])
      .then(([z, l]) => {
        setZones(z);
        setLinked(l);
        setZoneId((current) => (z.some((x) => x.id === current) ? current : z[0]?.id ?? NEW));
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this provider's zones.")));
  }, [open, providerId]);

  const newZone = zoneId === NEW;
  const newCountry = countryId === NEW;
  const current = linked.find((l) => l.countryId === countryId);
  const provider = providers.find((p) => p.id === providerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId) return setError("Choose a provider.");
    if (newZone ? !zoneName.trim() : !zoneId) return setError("Choose a zone, or name a new one.");
    if (newCountry ? !/^[A-Z]{2}$/.test(code) || !name.trim() : !countryId) {
      return setError(newCountry ? "A new country needs a 2-letter code and a name." : "Choose a country.");
    }
    setError(null);
    setIsSubmitting(true);
    try {
      let country = countries.find((c) => c.id === countryId);
      if (newCountry) {
        country = await apiClient.post<CountryDto>("/admin/countries", { code, name: name.trim() });
      } else if (country && !country.isActive) {
        // Adding it to a provider means it should be quotable again.
        country = await apiClient.patch<CountryDto>(`/admin/countries/${country.id}`, { isActive: true });
      }
      const zone = newZone
        ? await apiClient.post<ZoneDto>("/admin/zones", { rateProviderId: providerId, name: zoneName.trim() })
        : zones.find((z) => z.id === zoneId)!;
      await apiClient.post(`/admin/zones/${zone.id}/countries`, { countryId: country!.id });
      showToast({ variant: "success", title: `${country!.name} added to ${provider?.name} · ${zone.name}` });
      onSaved();
      setOpen(false);
      setCountryId("");
      setCode("");
      setName("");
      setZoneName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't add the country. Nothing else was changed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Add country"
          description="A country is priced through its provider's zone. Pick all three."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-country-provider">Provider</Label>
              <NativeSelect
                id="add-country-provider"
                value={providerId}
                disabled={Boolean(fixedProviderId)}
                onChange={(e) => setProviderId(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-country-zone">Zone</Label>
              <NativeSelect id="add-country-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.countryCount} {z.countryCount === 1 ? "country" : "countries"})
                  </option>
                ))}
                <option value={NEW}>New zone…</option>
              </NativeSelect>
              {newZone && (
                <Input
                  aria-label="New zone name"
                  placeholder="e.g. Zone 4"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-country-country">Country</Label>
              <NativeSelect
                id="add-country-country"
                searchable
                searchPlaceholder="Search countries"
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
              >
                <option value="">Choose a country</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code}){c.isActive ? "" : " · inactive"}
                  </option>
                ))}
                <option value={NEW}>Not in the list…</option>
              </NativeSelect>
              {newCountry && (
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <Input
                    aria-label="Country code"
                    placeholder="Code"
                    maxLength={2}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <Input
                    aria-label="Country name"
                    placeholder="Country name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              {current && (
                <p className="text-xs text-muted-foreground">
                  Already in {current.zoneName} for {provider?.name}. Saving moves it to the zone above.
                </p>
              )}
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Add country
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
