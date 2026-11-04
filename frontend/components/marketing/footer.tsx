"use client";

import Link from "next/link";
import { ArrowRight, ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { useCurrentYear } from "@/lib/utils/use-current-year";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Logo } from "@/components/brand/logo";
import { InstallAppButton } from "@/components/pwa/install-prompt";
import { REGISTERED_COMPANY } from "@nationwide/shared-types";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

// min-h-11 keeps every footer link a 44px touch target on phones without spacing the list out.
const LINK =
  "inline-flex min-h-11 items-center rounded-sm text-white/60 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:min-h-0 sm:py-1";

type FooterLink = { label: string; href: string; gated?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Ship",
    links: [
      { label: "Explore prices", href: "/prices" },
      { label: "Get a quote", href: "/quote", gated: true },
      { label: "Schedule a pickup", href: "/dashboard", gated: true },
      { label: "Track a shipment", href: "/track" },
      { label: "Shipping guidelines", href: "/shipping-guidelines" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/#about" },
      { label: "Services", href: "/#services" },
      { label: "Business accounts", href: "/#business" },
      { label: "Offers", href: "/offers" },
      { label: "Events and news", href: "/events" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms and conditions", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Prohibited items", href: "/terms#prohibited-goods" },
      { label: "FAQs", href: "/#faqs" },
    ],
  },
];

export function MarketingFooter() {
  const currentYear = useCurrentYear();
  const gate = useAuthGate();

  return (
    <footer className="bg-[#0b0b0c] text-white">
      {/* Action band: the two things a visitor can do without an account. */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight">Shipping abroad from India?</p>
            <p className="mt-2 text-sm text-white/60">
              Compare DHL, FedEx and UPS prices in INR before you sign up.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/prices"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-[#0b0b0c] transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c] active:bg-white/75"
            >
              Explore prices
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/track"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/15"
            >
              Track a shipment
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 space-y-4 text-sm lg:col-span-1">
          <Link href="/" className="inline-flex" aria-label="NationWide Logistics home">
            <Logo variant="reverse" size="sm" />
          </Link>
          <address className="flex flex-col items-start gap-2 not-italic text-white/60">
            <p className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {REGISTERED_COMPANY.address}
            </p>
            <a href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`} className={`${LINK} gap-2`}>
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {CONTACT_PHONE}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className={`${LINK} gap-2 break-all`}>
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {CONTACT_EMAIL}
            </a>
          </address>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">
              {column.title}
            </p>
            <ul className="mt-4 space-y-1 text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.gated ? (
                    <button type="button" onClick={() => gate(link.href)} className={LINK}>
                      {link.label}
                    </button>
                  ) : (
                    <Link href={link.href} className={LINK}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <p className="border-t border-white/10 py-6 text-xs text-white/50">
          Carriers we book with: DHL, DHL Express, FedEx and UPS. One booking, one invoice, one
          tracking ID.
        </p>
      </div>

      {/* A GST-registered business states its registration where it trades, and for a
          proprietorship the trade name alone does not say who is liable. Read from
          REGISTERED_COMPANY, the same constant the invoices use. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-8 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p>
            © {currentYear ?? ""} {REGISTERED_COMPANY.companyName}. All rights reserved.
          </p>
          <p>
            {REGISTERED_COMPANY.legalName} · GSTIN{" "}
            <span className="font-mono">{REGISTERED_COMPANY.gstin}</span>
          </p>
        </div>
        <div className="flex items-center gap-6">
          <InstallAppButton className={`${LINK} gap-2`} />
          <a href="#top" className={`${LINK} gap-1.5`}>
            Back to top
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
