"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Logo } from "@/components/brand/logo";

function ForgotPasswordForm() {
  // Carried over from the login page so nobody retypes the address they just tried.
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setApiError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Shown whether or not the address had an account — the server answers the same way for both,
  // and the screen must not undo that by revealing which happened.
  if (sent) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Logo variant="horizontal" size="md" className="mx-auto" />
          <MailCheck className="mx-auto h-10 w-10 text-success" aria-hidden />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for {email}, we have sent a link to reset the password. It
              works once and expires in an hour.
            </p>
          </div>
          <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
            Back to sign in
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
          <h1 className="text-2xl font-semibold text-foreground">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter the email you sign in with and we will send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError(null);
              }}
              error={Boolean(fieldError)}
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
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-1 items-center justify-center">
          <Spinner size="md" className="text-muted-foreground" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
