"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";
import { SiteBannerStrip, useSiteBanner } from "@/components/marketing/site-banner";

// Seven, not nine: "Home" is the logo, and "How it works" is a section of the homepage that the
// footer links to. "Get a quote" is the button on the right, not a link here as well.
const NAV_LINKS = [
  { label: "Services", href: "/#services" },
  { label: "Prices", href: "/prices" },
  { label: "Track shipment", href: "/track" },
  { label: "For business", href: "/#business" },
  { label: "Events", href: "/events" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/contact" },
];

// /events/diwali-open-day still marks "Events". Hash links point into the homepage, so they are
// never "current": the bar does not follow the reader's scroll position.
function isActivePath(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function dashboardHrefForRole(role: string): string {
  if (role === "CUSTOMER") return "/dashboard";
  if (role === "PICKUP_PARTNER") return "/partner/requests";
  return "/admin/dashboard";
}

export function MarketingNavbar() {
  const { user } = useAuth();
  const gate = useAuthGate();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { banner, dismiss } = useSiteBanner();
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);

  // The bar is glass over the hero at the top and gains a shadow once the page moves under it.
  // useScroll is a motion value, not React state per frame: setScrolled only fires a render when
  // the answer flips.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  // A route change closes the menu. Adjusting state while rendering, keyed on the path, rather
  // than in an effect: the menu is gone on the first paint of the new page, not one frame later.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMobileOpen(false);
  }

  // While the menu is open: the page behind does not scroll, Escape closes it and gives focus
  // back to the button that opened it, and focus starts on the first link.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstMenuLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  // The homepage is the one page whose hero runs underneath the bar, so it gets no spacer.
  const isHome = pathname === "/";
  const dashboardHref = user ? dashboardHrefForRole(user.role) : undefined;
  const closeMenu = () => setMobileOpen(false);

  return (
    <>
      {/* Pinned, not sticky: `fixed` is out of flow from the first frame, so the bar sits in the
          same place on every page at every scroll position. */}
      <header
        id="top"
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-200",
          scrolled || mobileOpen
            ? "border-border/70 bg-card/85 shadow-[0_8px_24px_-16px_rgba(11,11,12,0.25)] backdrop-blur-xl"
            : "border-transparent bg-card/55 backdrop-blur-md",
        )}
      >
        {banner && <SiteBannerStrip banner={banner} onDismiss={dismiss} />}
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
          <Link
            href="/"
            aria-label="NationWide home"
            className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo variant="horizontal" size="sm" />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
            {NAV_LINKS.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                  {/* The current page is underlined; hover previews the same line at half strength.
                      scaleX, so only transform animates. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-3 -bottom-px h-0.5 origin-left rounded-full bg-foreground transition-transform duration-200 motion-reduce:transition-none",
                      active ? "scale-x-100" : "scale-x-0 opacity-40 group-hover:scale-x-100",
                    )}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-2 xl:flex">
            {dashboardHref ? (
              <Link href={dashboardHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Log in
              </Link>
            )}
            <Button size="sm" onClick={() => gate("/quote")}>
              Get a quote
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          <button
            ref={menuButton}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id="mobile-menu"
              key="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-card px-4 pb-6 pt-2 sm:px-6 xl:hidden"
            >
              <nav aria-label="Main" className="flex flex-col">
                {NAV_LINKS.map((link, i) => {
                  const active = isActivePath(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      ref={i === 0 ? firstMenuLink : undefined}
                      href={link.href}
                      onClick={closeMenu}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center justify-between border-b border-border/60 text-base font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {link.label}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {dashboardHref ? (
                  <Link
                    href={dashboardHref}
                    onClick={closeMenu}
                    className={buttonVariants({ variant: "secondary", className: "min-h-12" })}
                  >
                    Dashboard
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    onClick={closeMenu}
                    className={buttonVariants({ variant: "secondary", className: "min-h-12" })}
                  >
                    Log in
                  </Link>
                )}
                <Button
                  className="min-h-12"
                  onClick={() => {
                    closeMenu();
                    gate("/quote");
                  }}
                >
                  Get a quote
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* The 4rem the pinned bar no longer takes in the document. The homepage is exempt: its hero
          is designed to sit underneath the glass, and its own top padding clears the bar. */}
      {!isHome && <div aria-hidden className="h-16 shrink-0" />}
      {/* The banner row, which sits inside the pinned bar, needs its own room on every page. */}
      {banner && <div aria-hidden className="h-11 shrink-0" />}
    </>
  );
}
