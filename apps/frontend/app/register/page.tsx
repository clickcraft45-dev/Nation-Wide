"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Loader2 } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

interface FormState {
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: FormState = { name: "", phone: "", email: "", password: "", confirmPassword: "" };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export default function RegisterPage() {
  const { register, user, isLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;
    router.replace(user.role === "CUSTOMER" ? "/dashboard" : "/admin/dashboard");
  }, [isLoading, user, router]);

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!isValidPhone(form.phone)) {
      next.phone = "Phone must be in E.164 format, e.g. +919876543210.";
    }
    if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    if (form.password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
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
      await register({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // Redirect happens in the effect above once `user` updates.
    } catch (err) {
      setApiError(
        err instanceof ApiError && err.status === 409
          ? "An account with this email or phone number already exists."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || user) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Package className="h-5 w-5 text-white" aria-hidden />
          </div>
          <span className="text-lg font-semibold text-foreground">NationWide</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage your shipments with NationWide.
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={Boolean(errors.email)}
            />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              error={Boolean(errors.password)}
            />
            {errors.password && <FieldError>{errors.password}</FieldError>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              error={Boolean(errors.confirmPassword)}
            />
            {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
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
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
