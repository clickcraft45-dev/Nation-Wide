"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { AnnouncementDto } from "@nationwide/shared-types";
import { API_BASE_URL } from "@/lib/api-client";
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
  { label: "For Business", href: "/#business" },
  { label: "Contact", href: "/contact" },
];

function dashboardHrefForRole(role: string): string {
  if (role === "CUSTOMER") return "/dashboard";
  if (role === "PICKUP_PARTNER") return "/partner/requests";
  return "/admin/dashboard";
}

const BANNER_DISMISSED_KEY = "nw-banner-dismissed";

/**
 * The live sale or event an admin switched "Site banner" on for, if any. Fetched in the browser
 * so every marketing page gets it without each one threading it through; the API response is
 * publicly cacheable for five minutes. Dismissal lasts the browser session and is keyed by
 * version, so editing the banner shows it again.
 */
function useSiteBanner() {
  const [banner, setBanner] = useState<AnnouncementDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/announcements/banner`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { banner: AnnouncementDto | null } | null) => {
        const b = data?.banner;
        if (cancelled || !b) return;
        try {
          if (sessionStorage.getItem(BANNER_DISMISSED_KEY) === `${b.id}:${b.updatedAt}`) return;
        } catch {
          // Storage blocked: show it, the dismiss button still works for this page view.
        }
        setBanner(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  function dismiss() {
    if (!banner) return;
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, `${banner.id}:${banner.updatedAt}`);
    } catch {}
    setBanner(null);
  }
  return { banner, dismiss };
}

export function MarketingNavbar() {
  const { user } = useAuth();
  const gate = useAuthGate();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { banner, dismiss } = useSiteBanner();

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
        {banner && (
          <div className="bg-[#0b0b0c] text-white">
            <div className="mx-auto flex h-11 max-w-6xl items-center gap-3 px-6 text-sm">
              <Link
                href={banner.kind === "OFFER" ? "/offers" : `/events/${banner.slug}`}
                className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {/* The title gives way first on a narrow phone; the code is the part people need. */}
                <span className="truncate font-medium">{banner.title}</span>
                {banner.couponCode && (
                  <span className="shrink-0 font-mono font-semibold">{banner.couponCode}</span>
                )}
              </Link>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss announcement"
                className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white active:bg-white/20"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Logo variant="horizontal" size="sm" />
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 xl:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 xl:flex">
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
            className="-mr-2.5 ml-auto flex h-11 w-11 items-center justify-center text-foreground xl:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-card/95 px-6 py-4 backdrop-blur-xl xl:hidden">
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
      {/* The banner row, which sits inside the pinned bar, needs its own room on every page. */}
      {banner && <div aria-hidden className="h-11 shrink-0" />}
    </>
  );
}
