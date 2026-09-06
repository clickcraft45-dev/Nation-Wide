"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

interface FormState {
  name: string;
  email: string;
  phone: string;
  serviceArea: string;
  note: string;
}

const EMPTY: FormState = { name: "", email: "", phone: "", serviceArea: "", note: "" };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Applying is not signing up. A pickup partner can read customer addresses and collect payments,
 * so the account is created by the operations team after review — this form only joins the
 * queue. The copy says so plainly rather than implying an account appears at the end.
 */
export function PartnerApplicationForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    if (!isValidPhone(form.phone)) {
      next.phone = "Phone must be in E.164 format, e.g. +919876543210.";
    }
    if (form.serviceArea.trim().length < 2) {
      next.serviceArea = "Tell us which area you can cover.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await apiClient.post("/partner-applications", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        serviceArea: form.serviceArea.trim(),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      setSubmitted(true);
    } catch (err) {
      setApiError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-6 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-success" aria-hidden />
        <p className="text-sm font-medium text-foreground">Application received</p>
        <p className="text-sm text-muted-foreground">
          Our operations team reviews every application. If you are a good fit we will email you
          the login details for the partner app.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="partner-name">Full name</Label>
        <Input
          id="partner-name"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={Boolean(errors.name)}
        />
        {errors.name && <FieldError>{errors.name}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-phone">Phone</Label>
        <Input
          id="partner-phone"
          autoComplete="tel"
          placeholder="+919876543210"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          error={Boolean(errors.phone)}
        />
        {errors.phone && <FieldError>{errors.phone}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-email">Email</Label>
        <Input
          id="partner-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={Boolean(errors.email)}
        />
        {errors.email && <FieldError>{errors.email}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-area">Area you can cover</Label>
        <Input
          id="partner-area"
          placeholder="e.g. Hyderabad — Madhapur, Gachibowli"
          value={form.serviceArea}
          onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
          error={Boolean(errors.serviceArea)}
        />
        {errors.serviceArea && <FieldError>{errors.serviceArea}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-note">Anything else? (optional)</Label>
        <Input
          id="partner-note"
          placeholder="Vehicle, working hours, experience"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {apiError}
        </div>
      )}

      {/* Set expectations before the click, not after — no password field appears here, and no
          account exists at the end of it. */}
      <p className="text-sm text-muted-foreground">
        No password yet. Our operations team reviews your application and emails your login
        details if you are a good fit.
      </p>

      <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
        {isSubmitting ? "Sending…" : "Submit application"}
      </Button>
    </form>
  );
}
