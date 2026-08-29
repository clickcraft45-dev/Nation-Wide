"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { motion, useScroll, useSpring } from "motion/react";
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
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Read progress straight from the scroll position and smooth it with a spring, so the bar
  // glides rather than stepping with each wheel tick.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.25 });

  // Every page — the homepage included — now opens on a white surface, so the bar is always the
  // same frosted-light glass. No over-the-dark-hero variant to keep in sync any more.
  const isHome = pathname === "/";

  // Highlight whichever section is currently crossing the upper third of the viewport.
  useEffect(() => {
    if (!isHome) return;
    const ids = NAV_LINKS.map((l) => l.href.split("#")[1]).filter(Boolean) as string[];
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    sections.forEach((section) => io.observe(section));
    return () => io.disconnect();
  }, [isHome]);

  const dashboardHref = user ? dashboardHrefForRole(user.role) : undefined;
  const linkClass = "text-muted-foreground hover:text-foreground";

  return (
    <header
      id="top"
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        // On the homepage the bar overlays the hero (negative margin pulls the hero up under it),
        // so the glass refracts the hero's aurora rather than the flat page background.
        isHome && "-mb-16",
        "border-border/60 bg-card/70 backdrop-blur-xl supports-[backdrop-filter]:bg-card/55",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo variant="horizontal" size="sm" />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = activeSection !== null && link.href.endsWith(`#${activeSection}`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative py-1 text-sm font-medium transition-colors",
                  active ? "text-foreground" : linkClass,
                )}
              >
                {link.label}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
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

      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
      />

      {mobileOpen && (
        <div className="border-t border-border bg-card/95 px-6 py-4 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="-mx-2 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
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
  );
}
