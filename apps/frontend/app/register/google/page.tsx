"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/state/auth-context";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Logo } from "@/components/brand/logo";

function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

// The one extra step for a brand-new Google sign-up: the backend already has a verified email +
// name (proven by `token`, a short-lived signed JWT — see AuthService.loginOrPrepareGoogleSignup)
// but Customer.phone is required/unique and Google doesn't reliably provide one.
function RegisterGooglePageInner() {
  const { completeGoogleSignup } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!isValidPhone(phone)) {
      setFieldError("Phone must be in E.164 format, e.g. +919876543210.");
      return;
    }
    setFieldError(null);
    if (!token) return;

    setIsSubmitting(true);
    try {
      await completeGoogleSignup(token, phone.trim());
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setApiError("This phone number is already registered to another account.");
      } else if (err instanceof ApiError && err.status === 401) {
        setApiError("This sign-up link has expired. Please continue with Google again.");
      } else {
        setApiError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo variant="horizontal" size="md" />
        <p className="text-sm text-muted-foreground">This sign-up link is invalid or has expired.</p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-5 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm space-y-6 sm:space-y-7">
        <Link href="/" className="inline-flex">
          <Logo variant="horizontal" size="md" />
        </Link>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">One more step</h1>
          <p className="text-sm text-muted-foreground">
            We use your phone number to coordinate pickups and send shipment updates.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={Boolean(fieldError)}
              aria-describedby={fieldError ? "phone-error" : undefined}
              className="h-11 text-base"
            />
            {fieldError && <FieldError>{fieldError}</FieldError>}
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
            {isSubmitting ? "Creating account…" : "Finish creating account"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function RegisterGooglePage() {
  return (
    <Suspense fallback={null}>
      <RegisterGooglePageInner />
    </Suspense>
  );
}
