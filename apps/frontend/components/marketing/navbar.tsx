"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Menu, X } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { Button, buttonVariants } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "Track", href: "#track" },
  { label: "Services", href: "#services" },
  { label: "Get a Quote", href: "#quote" },
  { label: "Reviews", href: "#testimonials" },
];

export function MarketingNavbar({ onGetQuote }: { onGetQuote: () => void }) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dashboardHref = user?.role === "CUSTOMER" ? "/dashboard" : "/admin/dashboard";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Package className="h-4 w-4 text-white" aria-hidden />
          </div>
          <span className="text-base font-semibold text-foreground">NationWide</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <Button variant="secondary" size="sm" onClick={onGetQuote}>
            Get a Quote
          </Button>
          {user ? (
            <Link href={dashboardHref} className={buttonVariants({ size: "sm" })}>
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Sign in
            </Link>
          )}
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="ml-auto text-foreground md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-card px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMobileOpen(false);
                  onGetQuote();
                }}
              >
                Get a Quote
              </Button>
              {user ? (
                <Link
                  href={dashboardHref}
                  onClick={() => setMobileOpen(false)}
                  className={buttonVariants({ size: "sm" })}
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className={buttonVariants({ size: "sm" })}
                >
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
