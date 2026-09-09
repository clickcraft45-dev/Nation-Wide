"use client";

import { useState, type ReactNode } from "react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Approving an application is the moment a public submission becomes a privileged
 * PICKUP_PARTNER account. The server generates the first password and emails it to the
 * applicant, so this is now a confirmation rather than a form — nothing an admin types here
 * could be safer than a credential that never passes through them.
 */
export function ApproveApplicationDialog({
  trigger,
  applicationId,
  applicantName,
  onApproved,
}: {
  trigger: ReactNode;
  applicationId: string;
  applicantName: string;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/admin/partner-applications/${applicationId}/approve`, {});
      showToast({ variant: "success", title: `${applicantName} is now a pickup partner` });
      onApproved();
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't approve this application. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title={`Approve ${applicantName}`}
          description="This creates a partner account and emails them their sign-in details, including a generated password."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Approve and create account
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
