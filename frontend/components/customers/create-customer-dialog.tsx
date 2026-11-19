"use client";

import { useState, type ReactNode } from "react";
import type { B2bInviteResultDto, CustomerDto } from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
}

const EMPTY: FormState = { name: "", phone: "", email: "", address: "" };

/**
 * A new customer, or with `business` a new business account.
 *
 * A business is the same customer record, invited to the B2B portal the moment it exists: the
 * invitation email is how they get in (they set their own password from it), so the email is
 * required for a business and optional for anyone else. Ordering links for their despatch desks
 * are then issued from the business's own page, which is where `onCreated` should take the admin.
 */
export function CreateCustomerDialog({
  trigger,
  onCreated,
  business = false,
}: {
  trigger: ReactNode;
  onCreated: (customer: CustomerDto) => void;
  business?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = business ? "Business name is required." : "Name is required.";
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone)) {
      next.phone = "Phone must be in E.164 format, e.g. +919876543210.";
    }
    if (business && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "The invitation is sent here, so a valid email is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    let customer: CustomerDto;
    try {
      customer = await apiClient.post<CustomerDto>("/customers", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        consentSource: business ? "admin_b2b_invite" : "staff_entry",
      });
    } catch (err) {
      setApiError(
        err instanceof ApiError && err.status === 409
          ? "A customer with this phone number already exists. Open them from People and invite them to the B2B portal there."
          : `Failed to create the ${business ? "business" : "customer"}. Please try again.`,
      );
      setIsSubmitting(false);
      return;
    }

    if (business) {
      // Two calls, not atomic: if the invite fails the account still exists, so say so and send
      // the admin to its page, where "Invite to B2B portal" retries it. Retrying here would 409.
      try {
        const invite = await apiClient.post<B2bInviteResultDto>(
          `/admin/customers/${customer.id}/b2b-links/invite`,
          {},
        );
        customer = { ...customer, isB2b: true };
        showToast({
          variant: "success",
          title: `${customer.name} created and invited`,
          description: `Invitation sent to ${invite.email}. Next, issue ordering links for their teams.`,
        });
      } catch (err) {
        showToast({
          variant: "error",
          title: `${customer.name} created, but the invitation failed`,
          description: errorMessage(err, "Send it again from their page."),
        });
      }
    } else {
      showToast({ variant: "success", title: "Customer created" });
    }

    onCreated(customer);
    setOpen(false);
    setForm(EMPTY);
    setIsSubmitting(false);
  }

  const noun = business ? "business" : "customer";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title={business ? "New business" : "New customer"}
          description={
            business
              ? "Creates the account and emails them an invitation to the B2B portal. They set their own password from it."
              : "Adds a customer record. Consent is recorded as staff-entered."
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor={`${noun}-name`}>{business ? "Business name" : "Name"}</Label>
              <Input
                id={`${noun}-name`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={Boolean(errors.name)}
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${noun}-email`}>{business ? "Email" : "Email (optional)"}</Label>
                <Input
                  id={`${noun}-email`}
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  error={Boolean(errors.email)}
                />
                {errors.email && <FieldError>{errors.email}</FieldError>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${noun}-phone`}>Phone</Label>
                <PhoneInput
                  id={`${noun}-phone`}
                  value={form.phone}
                  onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                  error={Boolean(errors.phone)}
                />
                {errors.phone && <FieldError>{errors.phone}</FieldError>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${noun}-address`}>Address (optional)</Label>
              <Input
                id={`${noun}-address`}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            {apiError && <FieldError>{apiError}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                {business ? "Create and send invitation" : "Create customer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
