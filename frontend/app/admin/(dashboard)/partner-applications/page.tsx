"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApproveApplicationDialog } from "@/components/pickup-partners/approve-application-dialog";

interface PartnerApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  serviceArea: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

export default function PartnerApplicationsPage() {
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PartnerApplication[]>("/admin/partner-applications")
      .then(setApplications)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load partner applications."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function reject(application: PartnerApplication) {
    try {
      await apiClient.patch(`/admin/partner-applications/${application.id}/reject`, {});
      showToast({ variant: "success", title: `Application from ${application.name} rejected` });
      load();
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't reject this application."),
      });
    }
  }

  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-8 w-8" aria-hidden />}
        title="No partner applications"
        description="Applications submitted from the public sign-up page appear here for review."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Applicant</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((application) => (
          <TableRow key={application.id}>
            <TableCell>
              <span className="font-medium">{application.name}</span>
              {application.note && (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {application.note}
                </span>
              )}
            </TableCell>
            <TableCell>
              <span className="block">{application.email}</span>
              <span className="block text-sm text-muted-foreground">{application.phone}</span>
            </TableCell>
            <TableCell>{application.serviceArea}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[application.status]}>{application.status}</Badge>
            </TableCell>
            <TableCell>
              {application.status === "PENDING" ? (
                <span className="flex gap-2">
                  <ApproveApplicationDialog
                    applicationId={application.id}
                    applicantName={application.name}
                    onApproved={load}
                    trigger={<Button size="sm">Approve</Button>}
                  />
                  <ConfirmDialog
                    title={`Reject ${application.name}?`}
                    description="No account is created. They can apply again later."
                    confirmLabel="Reject"
                    variant="danger"
                    onConfirm={() => reject(application)}
                    trigger={
                      <Button size="sm" variant="secondary">
                        Reject
                      </Button>
                    }
                  />
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Reviewed
                  {application.reviewedAt
                    ? ` ${new Date(application.reviewedAt).toLocaleDateString()}`
                    : ""}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
