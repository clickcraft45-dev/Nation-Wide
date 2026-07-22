"use client";

import { useEffect, useMemo, useState } from "react";
import { FileQuestion, Plus } from "lucide-react";
import { listMockQuotes } from "@/lib/mock-data";
import type { QuoteRequest } from "@/lib/types/placeholder";
import { NativeSelect } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { GenerateQuoteDialog } from "@/components/quotes/generate-quote-dialog";
import { ReviewQuoteDialog } from "@/components/quotes/review-quote-dialog";

const STATUS_VARIANT = {
  PENDING_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

const REASON_LABEL: Record<string, string> = {
  DANGEROUS_GOODS: "Dangerous Goods",
  OVERSIZED: "Oversized",
  RESTRICTED_DESTINATION: "Restricted Destination",
  SPECIAL_HANDLING: "Special Handling",
};

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    listMockQuotes()
      .then(setQuotes)
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(
    () => (statusFilter ? quotes.filter((q) => q.status === statusFilter) : quotes),
    [quotes, statusFilter],
  );

  function approve(id: string, amount: number) {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, status: "APPROVED", quotedAmount: amount } : q,
      ),
    );
    showToast({ variant: "success", title: "Quote approved" });
  }

  function reject(id: string) {
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status: "REJECTED" } : q)));
    showToast({ variant: "success", title: "Quote rejected" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quote Requests</h1>
          <p className="text-sm text-muted-foreground">
            Placeholder data — no quote engine backend yet.
          </p>
        </div>
        <GenerateQuoteDialog
          onCreate={(q) => setQuotes((prev) => [q, ...prev])}
          trigger={
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Generate Quote
            </Button>
          }
        />
      </div>

      <NativeSelect
        className="sm:w-52"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="PENDING_REVIEW">Pending review</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </NativeSelect>

      {isLoading && <TableSkeleton columns={6} />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<FileQuestion className="h-8 w-8" aria-hidden />}
          title="No quote requests found"
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Review Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Quoted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((q) => (
              <TableRow key={q.id}>
                <TableCell>{q.customerName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {q.origin} → {q.destination}
                </TableCell>
                <TableCell>{q.weightKg}kg</TableCell>
                <TableCell>
                  {q.reviewReason ? (
                    <Badge variant="info">{REASON_LABEL[q.reviewReason]}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[q.status]}>
                    {q.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {q.quotedAmount ? `₹${q.quotedAmount.toLocaleString("en-IN")}` : "—"}
                </TableCell>
                <TableCell>
                  {q.status === "PENDING_REVIEW" ? (
                    <ReviewQuoteDialog
                      quote={q}
                      onApprove={(amount) => approve(q.id, amount)}
                      onReject={() => reject(q.id)}
                      trigger={
                        <Button variant="secondary" size="sm">
                          Review
                        </Button>
                      }
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
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
