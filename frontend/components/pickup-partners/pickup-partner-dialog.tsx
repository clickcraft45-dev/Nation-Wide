"use client";

import { useState, type ReactNode } from "react";
import type { PickupPartnerDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

// Create-only — there is no self-service registration for field executives, matching
// PickupPartnersService's own doc comment (accounts are onboarded here, then the partner logs
// in with the email/password an admin set up).
export function PickupPartnerDialog({
  trigger,
  onSaved,
}: {
  trigger: ReactNode;
  onSaved: (partner: PickupPartnerDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("An email address is required — it is where their sign-in details are sent.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = await apiClient.post<PickupPartnerDto>("/admin/pickup-partners", {
        // No password: the server generates one and emails it to the partner.
        email: email.trim(),
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      showToast({ variant: "success", title: "Pickup partner created" });
      onSaved(saved);
      setOpen(false);
      setEmail("");
      setName("");
      setPhone("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the partner. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="New Pickup Partner">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="partner-name">Name</Label>
              <Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner-phone">Phone</Label>
              <PhoneInput id="partner-phone" value={phone} onChange={setPhone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner-email">Email</Label>
              <Input
                id="partner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              A password is generated and emailed to this address with their sign-in details.
            </p>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Create Partner
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
