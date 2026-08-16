"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Track Shipment", href: "/#track" },
  { label: "Contact", href: "/#contact" },
];

function dashboardHrefForRole(role: string): string {
  if (role === "CUSTOMER") return "/dashboard";
  if (role === "PICKUP_PARTNER") return "/partner/dashboard";
  return "/admin/dashboard";
}

export function MarketingNavbar() {
  const { user } = useAuth();
  const gate = useAuthGate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dashboardHref = user ? dashboardHrefForRole(user.role) : undefined;

  return (
    <header
      id="top"
      className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo variant="horizontal" size="sm" />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <Button variant="secondary" size="sm" onClick={() => gate("/quote")}>
            Get a Quote
          </Button>
          {dashboardHref ? (
            <Link href={dashboardHref} className={buttonVariants({ size: "sm" })}>
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Login
            </Link>
          )}
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="-mr-2.5 ml-auto flex h-11 w-11 items-center justify-center text-foreground lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-card px-6 py-4 lg:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMobileOpen(false);
                  gate("/quote");
                }}
              >
                Get a Quote
              </Button>
              {dashboardHref ? (
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
                  Login
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
