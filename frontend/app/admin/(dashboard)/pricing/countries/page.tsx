"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import type { CountryDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
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

export default function PricingCountriesPage() {
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CountryDto[]>("/admin/countries")
      .then(setCountries)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load countries." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CountryDialog onSaved={() => load()} trigger={<Button size="sm">New country</Button>} />
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && countries.length === 0 && (
        <EmptyState icon={<Globe className="h-8 w-8" aria-hidden />} title="No countries yet" />
      )}
      {!isLoading && !error && countries.length > 0 && (
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
            {countries.map((c) => (
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
