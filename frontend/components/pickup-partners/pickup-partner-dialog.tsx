"use client";

import { useState, type ReactNode } from "react";
import type { PickupPartnerDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

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
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 10) {
      setError("A valid email and a password of at least 10 characters are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = await apiClient.post<PickupPartnerDto>("/admin/pickup-partners", {
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      showToast({ variant: "success", title: "Pickup partner created" });
      onSaved(saved);
      setOpen(false);
      setEmail("");
      setPassword("");
      setName("");
      setPhone("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "An account with that email already exists."
          : "Couldn't create the partner. Please try again.",
      );
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
              <Input id="partner-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
            <div className="space-y-1.5">
              <Label htmlFor="partner-password">Password</Label>
              <PasswordInput
                id="partner-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

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
