"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Copy } from "lucide-react";
import type { B2bLinkDto, B2bRequestApprovalDto, B2bRequestDto } from "@nationwide/shared-types";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const STATUS_VARIANT = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

/**
 * Businesses that asked for an account from the website's "For business" section.
 *
 * Approving creates (or reuses) the customer and issues their ordering link in one step. The link
 * is shown once, here, because only its hash is stored — copy it before leaving the page.
 */
export default function B2bRequestsPage() {
  const [requests, setRequests] = useState<B2bRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ company: string; link: B2bLinkDto } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<B2bRequestDto[]>("/admin/b2b-requests")
      .then(setRequests)
      .catch((err) => setError(errorMessage(err, "Failed to load B2B requests.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function approve(request: B2bRequestDto) {
    setBusyId(request.id);
    try {
      const result = await apiClient.patch<B2bRequestApprovalDto>(
        `/admin/b2b-requests/${request.id}/approve`,
        {},
      );
      setIssued({ company: request.companyName, link: result.link });
      showToast({
        variant: "success",
        title: `${request.companyName} approved`,
        description: "Copy their ordering link — it can't be shown again.",
      });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't approve this request.") });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(request: B2bRequestDto) {
    setBusyId(request.id);
    try {
      await apiClient.patch(`/admin/b2b-requests/${request.id}/reject`, {});
      showToast({ variant: "success", title: `Request from ${request.companyName} rejected` });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't reject this request.") });
    } finally {
      setBusyId(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ variant: "success", title: "Link copied" });
    } catch {
      showToast({ variant: "error", title: "Couldn't copy — select the link and copy it manually." });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">B2B Requests</h1>
        <p className="text-sm text-muted-foreground">
          Businesses asking for an account from the website. Approving creates the customer and
          issues their ordering link.
        </p>
      </div>

      {issued?.link.url && (
        <div className="space-y-2 rounded-lg border border-success-border bg-success-bg p-3">
          <p className="text-sm font-medium text-success">
            Ordering link for {issued.company} — copy it now, it cannot be shown again.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={issued.link.url} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="sm" variant="secondary" onClick={() => copy(issued.link.url!)}>
              <Copy className="h-4 w-4" aria-hidden /> Copy
            </Button>
          </div>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={6} />}
      {!error && !isLoading && requests.length === 0 && (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" aria-hidden />}
          title="No B2B requests yet"
          description="Requests from the website's For Business section appear here."
        />
      )}

      {!error && !isLoading && requests.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium text-foreground">
                  {request.companyName}
                  {request.createdCustomerId && (
                    <Link
                      href={`/admin/customers/${request.createdCustomerId}`}
                      className="mt-0.5 block text-xs font-normal text-primary hover:underline"
                    >
                      View customer
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  {request.contactName}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {request.email} · {request.phone}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {request.monthlyVolume ?? "—"}
                </TableCell>
                <TableCell className="max-w-xs">
                  <span className="line-clamp-2 text-muted-foreground">
                    {request.message ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[request.status]}>{request.status}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(request.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {request.status === "PENDING" && (
                    <div className="flex justify-end gap-2">
                      <ConfirmDialog
                        title={`Approve ${request.companyName}?`}
                        description="This creates the customer (if they are new) and issues an ordering link that can place orders billed to them."
                        confirmLabel="Approve & issue link"
                        onConfirm={() => approve(request)}
                        trigger={
                          <Button size="sm" disabled={busyId === request.id}>
                            Approve
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        title={`Reject ${request.companyName}?`}
                        description="Nothing is created. They can ask again later."
                        confirmLabel="Reject"
                        variant="danger"
                        onConfirm={() => reject(request)}
                        trigger={
                          <Button size="sm" variant="secondary" disabled={busyId === request.id}>
                            Reject
                          </Button>
                        }
                      />
                    </div>
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
