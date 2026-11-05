"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import type { CountryDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountryDialog } from "@/components/pricing/country-dialog";
import { AddCountryDialog } from "@/components/pricing/add-country-dialog";
import { SpreadsheetActions } from "@/components/pricing/spreadsheet-actions";
import { BackLink } from "@/components/ui/back-link";
import { SearchInput } from "@/components/ui/search-input";
import { searchCountries } from "@/lib/country-search";

export default function PricingCountriesPage() {
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => searchCountries(countries, search, countries.length), [countries, search]);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CountryDto[]>("/admin/countries")
      .then(setCountries)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load countries."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-4">
      <BackLink href="/admin/pricing/dashboard">Back to pricing</BackLink>
      <h1 className="text-xl font-semibold text-foreground">Countries</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <SearchInput
              placeholder="Search name, code or region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={64}
              aria-label="Search countries"
            />
          </div>
          {search.trim() && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {shown.length} of {countries.length}
            </p>
          )}
          <SpreadsheetActions resource="countries" label="Countries" onImported={load} />
        </div>
        <AddCountryDialog onSaved={load} trigger={<Button size="sm">Add country</Button>} />
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && countries.length === 0 && (
        <EmptyState icon={<Globe className="h-8 w-8" aria-hidden />} title="No countries yet" />
      )}
      {!isLoading && !error && countries.length > 0 && shown.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No countries match &quot;{search}&quot;.</p>
      )}
      {!isLoading && !error && shown.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={c.isActive ? "success" : "neutral"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <CountryDialog
                    country={c}
                    onSaved={() => load()}
                    trigger={
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
