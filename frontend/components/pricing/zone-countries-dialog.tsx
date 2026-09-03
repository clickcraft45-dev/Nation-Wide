"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { CountryDto, ZoneCountryDto, ZoneDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";

// Manage which countries belong to this zone. Assigning a country here silently moves it out of
// whatever other zone it previously belonged to under the same provider (ZonesService.assignCountry
// is a single atomic upsert) — that's the intended reassignment behavior, not a bug.
export function ZoneCountriesDialog({
  trigger,
  zone,
  onMembershipChanged,
}: {
  trigger: ReactNode;
  zone: ZoneDto;
  onMembershipChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ZoneCountryDto[]>([]);
  const [allCountries, setAllCountries] = useState<CountryDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingCountryId, setPendingCountryId] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    Promise.all([
      apiClient.get<ZoneCountryDto[]>(`/admin/zones/${zone.id}/countries`),
      apiClient.get<CountryDto[]>("/admin/countries"),
    ])
      .then(([m, c]) => {
        setMembers(m);
        setAllCountries(c.filter((x) => x.isActive));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zone.id]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.countryId)), [members]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const candidates = allCountries.filter((c) => !memberIds.has(c.id));
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [allCountries, memberIds, search]);

  async function assign(countryId: string) {
    setPendingCountryId(countryId);
    try {
      await apiClient.post(`/admin/zones/${zone.id}/countries`, { countryId });
      showToast({ variant: "success", title: "Country added to zone" });
      load();
      onMembershipChanged?.();
    } catch {
      showToast({ variant: "error", title: "Couldn't add that country. Please try again." });
    } finally {
      setPendingCountryId(null);
    }
  }

  async function unassign(countryId: string) {
    setPendingCountryId(countryId);
    try {
      await apiClient.delete(`/admin/zones/${zone.id}/countries/${countryId}`);
      showToast({ variant: "success", title: "Country removed from zone" });
      load();
      onMembershipChanged?.();
    } catch {
      showToast({ variant: "error", title: "Couldn't remove that country. Please try again." });
    } finally {
      setPendingCountryId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={`${zone.name} — countries`} className="max-w-lg">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                In this zone ({members.length})
              </p>
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  No countries assigned yet.
                </p>
              ) : (
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                  {members.map((m) => (
                    <span
                      key={m.countryId}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground"
                    >
                      {m.countryName}
                      <button
                        type="button"
                        onClick={() => unassign(m.countryId)}
                        disabled={pendingCountryId === m.countryId}
                        aria-label={`Remove ${m.countryName} from ${zone.name}`}
                        className="text-muted-foreground hover:text-danger"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add a country</p>
              <SearchInput
                placeholder="Search country…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search countries to add"
              />
              <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => assign(c.id)}
                    disabled={pendingCountryId === c.id}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.code}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No matching countries.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
