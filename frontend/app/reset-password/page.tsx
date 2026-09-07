"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Logo } from "@/components/brand/logo";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const next: typeof errors = {};
    // Same minimum the server enforces, so the rule is visible before the round-trip.
    if (password.length < 10) next.password = "Password must be at least 10 characters.";
    if (password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      // An expired or already-used link says so exactly — that is the whole reason someone is
      // stuck on this screen, and a generic message would leave them retrying a dead link.
      setApiError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <Logo variant="horizontal" size="md" className="mx-auto" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Link incomplete</h1>
          <p className="text-sm text-muted-foreground">
            This reset link is missing its token. Request a new one and open the link from your
            email directly.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <Logo variant="horizontal" size="md" className="mx-auto" />
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Password updated</h1>
          <p className="text-sm text-muted-foreground">
            You have been signed out everywhere else. Sign in with your new password.
          </p>
        </div>
        <Button className="w-full" size="lg" onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <Logo variant="horizontal" size="md" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          At least 10 characters. This link works once.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(errors.password)}
          />
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={Boolean(errors.confirm)}
          />
          {errors.confirm && <FieldError>{errors.confirm}</FieldError>}
        </div>

        {apiError && (
          <div
            role="alert"
            className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {apiError}
            <Link
              href="/forgot-password"
              className="mt-1 block font-medium text-danger underline"
            >
              Request a new link
            </Link>
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
          {isSubmitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
      {/* useSearchParams needs a Suspense boundary or the whole route opts out of prerendering. */}
      <Suspense
        fallback={<Spinner size="md" className="text-muted-foreground" />}
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
