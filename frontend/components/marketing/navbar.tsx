"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

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
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Every page — the homepage included — now opens on a white surface, so the bar is always the
  // same frosted-light glass. No over-the-dark-hero variant to keep in sync any more.
  // The homepage is the one page whose hero is meant to run underneath the bar, so it is the one
  // page that gets no spacer below.
  const isHome = pathname === "/";

  // There is deliberately no scroll-driven "current section" highlight here any more. It was an
  // IntersectionObserver flipping a marker between six links as the page moved, which is motion
  // in the corner of the eye of someone who is trying to read — and the bar is pinned now, so it
  // is on screen the whole time rather than only in passing.

  const dashboardHref = user ? dashboardHrefForRole(user.role) : undefined;

  return (
    <>
      {/* Pinned, not sticky. `sticky` still occupies a row in the document and only pins once
          scrolling reaches it; `fixed` is out of flow from the first frame, so the bar is in the
          same place on every page at every scroll position. The homepage wanted a negative margin
          to pull its hero up under the glass — out of flow, that happens on its own. */}
      <header
        id="top"
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b",
          "border-border/60 bg-card/70 backdrop-blur-xl supports-[backdrop-filter]:bg-card/55",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="horizontal" size="sm" />
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
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
            aria-expanded={mobileOpen}
            className="-mr-2.5 ml-auto flex h-11 w-11 items-center justify-center text-foreground lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-card/95 px-6 py-4 backdrop-blur-xl lg:hidden">
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={pathname === link.href ? "page" : undefined}
                  className={cn(
                    "-mx-2 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-3">
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

      {/* The 4rem the pinned bar no longer takes in the document. The homepage is exempt: its
          hero is designed to sit underneath the glass, and its own top padding clears the bar. */}
      {!isHome && <div aria-hidden className="h-16 shrink-0" />}
    </>
  );
}
