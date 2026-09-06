"use client";

import { useState, type ReactNode } from "react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Approving an application is the moment a public submission becomes a privileged
 * PICKUP_PARTNER account, so the admin sets its first password here by hand — the applicant
 * never chose one. Mirrors PickupPartnerDialog, which is the same act done from scratch.
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
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Same minimum the server enforces — checked here so the admin is told before the round-trip.
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/admin/partner-applications/${applicationId}/approve`, {
        password,
      });
      showToast({ variant: "success", title: `${applicantName} is now a pickup partner` });
      onApproved();
      setOpen(false);
      setPassword("");
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
          description="This creates a partner account they can sign in with straight away. Send them the password yourself — it is not shown again."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="approve-password">Initial password</Label>
              <PasswordInput
                id="approve-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(error)}
              />
              {error && <FieldError>{error}</FieldError>}
            </div>
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
