"use client";

import { useState, type ReactNode } from "react";
import type { CustomerDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
}

const EMPTY: FormState = { name: "", phone: "", email: "", address: "" };

export function CreateCustomerDialog({
  trigger,
  onCreated,
}: {
  trigger: ReactNode;
  onCreated: (customer: CustomerDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone)) {
      next.phone = "Phone must be in E.164 format, e.g. +919876543210.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const customer = await apiClient.post<CustomerDto>("/customers", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        consentSource: "staff_entry",
      });
      showToast({ variant: "success", title: "Customer created" });
      onCreated(customer);
      setOpen(false);
      setForm(EMPTY);
    } catch (err) {
      setApiError(
        err instanceof ApiError && err.status === 409
          ? "A customer with this phone number already exists."
          : "Failed to create the customer. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="New customer"
          description="Adds a customer record. Consent is recorded as staff-entered."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={Boolean(errors.name)}
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+919876543210"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                error={Boolean(errors.phone)}
              />
              {errors.phone && <FieldError>{errors.phone}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Address (optional)</Label>
              <Input
                id="address"
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
                Create customer
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
