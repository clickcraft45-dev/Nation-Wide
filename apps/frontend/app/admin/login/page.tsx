"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Package, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

interface FormErrors {
  email?: string;
  password?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminLoginPage() {
  const { login, user, isLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user && user.role !== "CUSTOMER") {
      router.replace("/admin/dashboard");
    }
  }, [isLoading, user, router]);

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
      router.replace("/admin/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("Invalid email or password.");
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
      title: "Contact your administrator",
      description: "Password resets for manager accounts are handled by an admin for now.",
    });
  }

  return (
    <div className="flex min-h-screen flex-1">
      {/* Hero / branding panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-sidebar-bg lg:flex lg:flex-col lg:justify-between lg:p-12">
        <HeroBackground />
        <div className="relative z-10 flex items-center gap-2 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-lg font-semibold">NationWide</span>
        </div>

        <div className="relative z-10 space-y-6 text-white">
          <h1 className="text-3xl font-semibold leading-tight">
            Operations, in one place.
          </h1>
          <p className="max-w-md text-sm text-sidebar-foreground">
            Manage orders, pickups, tracking, and customer relationships across every
            shipping provider — built for the team running the floor.
          </p>
          <div className="flex gap-8 pt-4">
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Secure, role-based access
            </div>
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Real-time operational visibility
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-sidebar-foreground/70">
          © {new Date().getFullYear()} NationWide. All rights reserved.
        </p>
      </div>

      {/* Login card */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1 lg:hidden">
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
                <Package className="h-5 w-5 text-white" aria-hidden />
              </div>
              <span className="text-lg font-semibold text-foreground">NationWide</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-foreground">Manager sign in</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your manager account to access the operations dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                placeholder="you@nationwide.com"
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
        </div>
      </div>
    </div>
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
      <circle cx="500" cy="120" r="180" stroke="#6366f1" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="500" cy="120" r="260" stroke="#6366f1" strokeOpacity="0.2" strokeWidth="1" />
      <path
        d="M-40 300 C 150 250, 250 400, 400 340 S 650 280, 700 380"
        stroke="#818cf8"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <path
        d="M-40 500 C 120 450, 260 600, 420 520 S 620 460, 700 560"
        stroke="#818cf8"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <g opacity="0.6">
        <circle cx="120" cy="620" r="3" fill="#a5b4fc" />
        <circle cx="260" cy="560" r="3" fill="#a5b4fc" />
        <circle cx="400" cy="620" r="3" fill="#a5b4fc" />
      </g>
    </svg>
  );
}
