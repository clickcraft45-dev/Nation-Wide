"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Logo } from "@/components/brand/logo";

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
 * Applying is not signing up. A pickup partner reads customer addresses and collects payments,
 * so the account is provisioned by the operations team after review — this form only joins the
 * queue. The copy says so plainly rather than implying an account appears at the end.
 */
export default function PartnerApplicationPage() {
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
      <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Logo variant="horizontal" size="md" className="mx-auto" />
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Application received</h1>
            <p className="text-sm text-muted-foreground">
              Our operations team reviews every application. If you are a good fit we will email
              you the login details for the partner app.
            </p>
          </div>
          <Link href="/" className="inline-block text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <Logo variant="horizontal" size="md" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Become a pickup partner</h1>
          <p className="text-sm text-muted-foreground">
            Collect parcels in your area and get paid per pickup. Our team reviews every
            application before setting up your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(errors.name)}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={Boolean(errors.email)}
            />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              autoComplete="tel"
              placeholder="+919876543210"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              error={Boolean(errors.phone)}
            />
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serviceArea">Area you can cover</Label>
            <Input
              id="serviceArea"
              placeholder="e.g. Hyderabad — Madhapur, Gachibowli"
              value={form.serviceArea}
              onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
              error={Boolean(errors.serviceArea)}
            />
            {errors.serviceArea && <FieldError>{errors.serviceArea}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Anything else? (optional)</Label>
            <Input
              id="note"
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

          <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
            {isSubmitting ? "Sending…" : "Submit application"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already a partner?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
