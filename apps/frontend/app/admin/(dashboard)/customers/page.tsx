"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import type { CustomerDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
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
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";

const PAGE_SIZE = 25;

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const load = () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    apiClient
      .getWithHeaders<CustomerDto[]>(`/customers?${params.toString()}`)
      .then(({ data, headers }) => {
        setCustomers(data);
        setTotal(Number(headers.get("X-Total-Count") ?? data.length));
      })
      .catch(() => setError("Failed to load customers."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on page/search change is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    // Typing a new search term immediately (not debounced) points the next fetch back at page 1
    // so results aren't stranded on a now out-of-range page.
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {total} total customer{total === 1 ? "" : "s"}
          </p>
        </div>
        <CreateCustomerDialog
          onCreated={load}
          trigger={
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              New Customer
            </Button>
          }
        />
      </div>

      <div className="sm:w-72">
        <SearchInput
          placeholder="Search by name, phone, email…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={4} />}

      {!error && !isLoading && customers.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" aria-hidden />}
          title="No customers found"
          description="Try a different search, or add a new customer."
        />
      )}

      {!error && !isLoading && customers.length > 0 && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Customer Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} href={`/admin/customers/${customer.id}`}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
