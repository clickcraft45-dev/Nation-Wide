"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import type { CustomerDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
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

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CustomerDto[]>("/customers")
      .then(setCustomers)
      .catch(() => setError("Failed to load customers."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} total customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <CreateCustomerDialog
          onCreated={(customer) => setCustomers((prev) => [customer, ...prev])}
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
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={5} />}

      {!error && !isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" aria-hidden />}
          title="No customers found"
          description="Try a different search, or add a new customer."
        />
      )}

      {!error && !isLoading && filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Customer Since</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell className="text-muted-foreground">
                  {customer.email ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(customer.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
