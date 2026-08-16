"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, TrendingUp, Loader2 } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { ApiError, API_BASE_URL } from "@/lib/api-client";
import { useCurrentYear } from "@/lib/utils/use-current-year";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Logo } from "@/components/brand/logo";
import { GoogleIcon } from "@/components/ui/google-icon";
import { TextDivider } from "@/components/ui/divider";

interface FormErrors {
  email?: string;
  password?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Only ever honor an internal, single-segment-rooted path from ?redirect= — anything else
// (an absolute URL, or "//evil.com" which browsers treat as protocol-relative) is rejected to
// avoid turning the login page into an open redirect.
function isSafeRedirectTarget(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

// The one and only login entry point. Role is never chosen here — the backend resolves it
// from whichever DB row the email matches, and this page only reacts to what it returns.
//
// Built mobile-first: the JSX below reads top-to-bottom as the MOBILE layout (compact logo →
// heading → Google button → divider → form) — the `lg:` split-screen panel is a later addition
// laid on top of that, not the layout mobile is squeezed into. `min-h-dvh` (not `min-h-screen`,
// i.e. not a bare 100vh) so mobile Safari/Chrome's dynamic browser-chrome doesn't clip content
// behind the address bar.
function LoginPageInner() {
  const { login, user, isLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(
    searchParams.get("error") === "google_denied"
      ? "That Google account can't sign in here. Please use email and password."
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentYear = useCurrentYear();

  useEffect(() => {
    if (isLoading || !user) return;
    const fallback =
      user.role === "CUSTOMER"
        ? "/dashboard"
        : user.role === "PICKUP_PARTNER"
          ? "/partner/dashboard"
          : "/admin/dashboard";
    router.replace(isSafeRedirectTarget(redirectParam) ? redirectParam : fallback);
  }, [isLoading, user, router, redirectParam]);

  function validate(): boolean {
    const errors: FormErrors = {};
    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await login(email, password);
      // Redirect happens in the effect above once `user` updates.
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setApiError("Too many attempts. Please wait a minute and try again.");
      } else {
        setApiError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    showToast({
      variant: "success",
      title: "Contact support",
      description: "Password resets aren't self-service yet — reach out to your administrator.",
    });
  }

  // A real top-level navigation, not a fetch() — Google's consent screen can't be shown inside
  // an XHR/fetch response. The backend redirects back to /login (existing account) or
  // /register/google (new customer, needs a phone number) once Google's side completes. If
  // Google isn't configured yet, the backend's GoogleConfiguredGuard returns a clear error page
  // rather than a confusing "invalid_client" from Google itself.
  function handleGoogleLogin() {
    window.location.href = `${API_BASE_URL}/auth/google`;
  }

  // Authenticated users never see the form — they're redirected the instant `user` resolves.
  if (isLoading || user) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 lg:min-h-screen">
      {/* Desktop split-panel branding — progressive enhancement over the mobile layout, not the
          source design mobile is derived from. Fully absent below lg, so it costs mobile visitors
          nothing. */}
      <div className="relative hidden w-1/2 overflow-hidden bg-sidebar-bg lg:flex lg:flex-col lg:justify-between lg:p-12">
        <HeroBackground />
        <Link href="/" className="relative z-10">
          <Logo variant="reverse" size="md" />
        </Link>

        <div className="relative z-10 space-y-6 text-white">
          <h1 className="text-3xl font-semibold leading-tight">
            Ship, track, and manage — in one place.
          </h1>
          <p className="max-w-md text-sm text-sidebar-foreground">
            One account for customers and operations teams alike. Sign in to track your
            shipments or run the floor.
          </p>
          <div className="flex gap-8 pt-4">
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Secure, role-based access
            </div>
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Real-time shipment visibility
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-sidebar-foreground/70">
          © {currentYear ?? ""} NationWide. All rights reserved.
        </p>
      </div>

      {/* Login form — this column IS the mobile page (full width below lg); the form inside it
          is shared as-is by both breakpoints. */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-5 py-8 sm:px-6 sm:py-12 lg:w-1/2">
        <div className="w-full max-w-sm space-y-6 sm:space-y-7">
          <div className="space-y-2 lg:hidden">
            <Link href="/" className="inline-flex">
              <Logo variant="horizontal" size="md" />
            </Link>
            <p className="text-xs font-medium text-muted-foreground">Delivering trust worldwide</p>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to continue.</p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full gap-2.5"
            onClick={handleGoogleLogin}
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </Button>

          <TextDivider>OR</TextDivider>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                placeholder="you@example.com"
                className="h-11 text-base"
              />
              {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className="h-11 text-base"
              />
              {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
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
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function HeroBackground() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-40"
      viewBox="0 0 600 800"
      fill="none"
      aria-hidden
    >
      <circle cx="500" cy="120" r="180" stroke="#1E88E5" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="500" cy="120" r="260" stroke="#1E88E5" strokeOpacity="0.2" strokeWidth="1" />
      <path
        d="M-40 300 C 150 250, 250 400, 400 340 S 650 280, 700 380"
        stroke="#4AA3EC"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <path
        d="M-40 500 C 120 450, 260 600, 420 520 S 620 460, 700 560"
        stroke="#4AA3EC"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <g opacity="0.6">
        <circle cx="120" cy="620" r="3" fill="#7FC2F5" />
        <circle cx="260" cy="560" r="3" fill="#7FC2F5" />
        <circle cx="400" cy="620" r="3" fill="#7FC2F5" />
      </g>
    </svg>
  );
}
