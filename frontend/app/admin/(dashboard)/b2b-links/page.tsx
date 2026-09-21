"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Link2, ShieldOff } from "lucide-react";
import type { B2bLinkDto, B2bLinkOverviewDto, CustomerDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN") : "—";
}

/**
 * Every standing B2B ordering link, across customers.
 *
 * Whoever holds one of these can book shipments billed to that customer without a login, so the
 * question this page exists to answer is "what is live right now, and who issued it". Revoked
 * links stay visible behind a toggle — a withdrawal is part of the record, not something to hide.
 */
export default function AdminB2bLinksPage() {
  const [links, setLinks] = useState<B2bLinkOverviewDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [search, setSearch] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const { showToast } = useToast();

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<B2bLinkOverviewDto[]>(`/admin/b2b-links?includeRevoked=${includeRevoked}`)
      .then((rows) => {
        setLinks(rows);
        // "Recently used" is measured from when the list was fetched, not from every render —
        // reading the clock during render makes the component impure.
        setLoadedAt(Date.now());
      })
      .catch((err) => setError(errorMessage(err, "Failed to load B2B links.")))
      .finally(() => setIsLoading(false));
  }, [includeRevoked]);

  useEffect(() => {
    // A one-shot fetch when the filter changes, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function revoke(link: B2bLinkOverviewDto) {
    try {
      await apiClient.patch(`/admin/customers/${link.customerId}/b2b-links/${link.id}/revoke`, {});
      showToast({ variant: "success", title: `"${link.label}" revoked` });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't revoke that link.") });
    }
  }

  const term = search.trim().toLowerCase();
  // Filtering in the browser: this list is one row per link issued, which stays in the dozens.
  const visible = term
    ? (links ?? []).filter(
        (link) =>
          link.label.toLowerCase().includes(term) ||
          link.customerName.toLowerCase().includes(term) ||
          (link.customerEmail ?? "").toLowerCase().includes(term),
      )
    : (links ?? []);

  const active = (links ?? []).filter((link) => !link.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">B2B links</h1>
          <p className="text-sm text-muted-foreground">
            Standing ordering links for business customers. Whoever holds one can book shipments
            billed to that customer, so revoking is the only way to take it back.
          </p>
        </div>
        <GenerateLinkDialog onCreated={load} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Live links" value={active.length} icon={Link2} />
        <StatCard
          label="Businesses covered"
          value={new Set(active.map((link) => link.customerId)).size}
        />
        <StatCard
          label="Used in the last 30 days"
          value={
            active.filter(
              (link) =>
                link.lastUsedAt &&
                loadedAt - new Date(link.lastUsedAt).getTime() < 30 * 24 * 60 * 60 * 1000,
            ).length
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <SearchInput
            placeholder="Search label, business or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search B2B links"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show revoked links
        </label>
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          icon={<Link2 className="h-8 w-8" aria-hidden />}
          title={links?.length ? "Nothing matches that search" : "No B2B links yet"}
          description="Generate one for a business and hand it to their despatch desk."
        />
      )}

      {!isLoading && !error && visible.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.label}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/customers/${link.customerId}`}
                    className="underline hover:text-foreground"
                  >
                    {link.customerName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {link.customerEmail ?? "no email on file"}
                    {link.customerIsB2b ? " · portal login" : ""}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {when(link.createdAt)}
                  {link.createdByEmail ? (
                    <span className="block text-xs">by {link.createdByEmail}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{when(link.lastUsedAt)}</TableCell>
                <TableCell>
                  {link.revokedAt ? (
                    <Badge variant="neutral">Revoked {when(link.revokedAt)}</Badge>
                  ) : (
                    <Badge variant="success">Live</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!link.revokedAt && (
                    <ConfirmDialog
                      title={`Revoke "${link.label}"?`}
                      description={`${link.customerName} can no longer order through this link. It cannot be un-revoked — issue a new one instead.`}
                      confirmLabel="Revoke"
                      variant="danger"
                      onConfirm={() => revoke(link)}
                      trigger={
                        <Button variant="secondary" size="sm">
                          <ShieldOff className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Revoke
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Pick a business, name the link, get the URL once.
 *
 * Only the hash is stored, so the URL shown here is the only sight of it — that is said plainly
 * rather than discovered when someone comes back looking for it.
 */
function GenerateLinkDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerDto[]>([]);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [label, setLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<B2bLinkDto | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      // Clearing stale matches as the box empties, not a cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    // Typing settles before the lookup fires; an admin types a company name faster than a round
    // trip completes.
    const timer = setTimeout(() => {
      apiClient
        .get<CustomerDto[]>(`/customers?search=${encodeURIComponent(term)}&pageSize=8`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function create() {
    if (!customer) return;
    setIsSaving(true);
    try {
      const link = await apiClient.post<B2bLinkDto>(`/admin/customers/${customer.id}/b2b-links`, {
        label: label.trim(),
      });
      setCreated(link);
      onCreated();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't generate the link.") });
    } finally {
      setIsSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setCreated(null);
    setCustomer(null);
    setLabel("");
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <span onClick={() => setOpen(true)}>
        <Button size="sm">
          <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Generate link
        </Button>
      </span>
      {open && (
        <DialogContent
          title={created ? "Link generated" : "Generate a B2B link"}
          description={
            created
              ? "Copy it now — it is stored as a hash and cannot be shown again."
              : "Pick the business and say what the link is for."
          }
        >
          {created ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={created.url ?? ""} aria-label="Link URL" />
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(created.url ?? "");
                    showToast({ variant: "success", title: "Link copied" });
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this URL can request pickups billed to {customer?.name}. Revoke it from
                the list if it goes astray.
              </p>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={close}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="b2b-customer">Business</Label>
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span>
                      {customer.name}
                      <span className="block text-xs text-muted-foreground">
                        {customer.email ?? customer.phone}
                      </span>
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setCustomer(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="b2b-customer"
                      placeholder="Search by name, phone or email…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {results.length > 0 && (
                      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                        {results.map((result) => (
                          <li key={result.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => setCustomer(result)}
                            >
                              {result.name}
                              <span className="block text-xs text-muted-foreground">
                                {result.email ?? result.phone}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="b2b-label">What is it for?</Label>
                <Input
                  id="b2b-label"
                  placeholder="Bengaluru warehouse, despatch desk…"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Several links per business is fine — one team&apos;s can be revoked without
                  cutting off the rest.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  disabled={!customer || !label.trim() || isSaving}
                  onClick={create}
                >
                  Generate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
