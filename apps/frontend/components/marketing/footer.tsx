"use client";

import Link from "next/link";
import { ArrowUp, Mail, Phone } from "lucide-react";
import { useCurrentYear } from "@/lib/utils/use-current-year";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Logo } from "@/components/brand/logo";
import { WorldMap } from "@/components/ui/world-map";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";
import { SHIPPING_ROUTES } from "@/lib/constants/routes";

const LINK = "text-white/55 transition-colors hover:text-white";

export function MarketingFooter() {
  const currentYear = useCurrentYear();
  const gate = useAuthGate();

  return (
    <footer id="contact" className="relative isolate overflow-hidden bg-[#09090b] text-white">
      {/* Backdrop: the dotted world map with its route arcs animating in behind the wordmark,
          plus one aurora well — the same material language as the hero, so the page opens and
          closes on the same surface. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <WorldMap
          routes={SHIPPING_ROUTES}
          className="absolute inset-x-0 bottom-0 aspect-auto h-2/3 opacity-40"
        />
        <div className="absolute -bottom-40 left-1/2 h-[30rem] w-[38rem] -translate-x-1/2 rounded-full bg-white/10 blur-[130px] animate-aurora-slow" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="reverse" size="sm" />
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.22em] text-white/45">
              Delivering trust worldwide
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
              Reliable domestic and international shipping, with tracking built in from day one.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
              Company
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/#about" className={LINK}>
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/#services" className={LINK}>
                  Services
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className={LINK}>
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#contact" className={LINK}>
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
              Shipping
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <button onClick={() => gate("/quote")} className={LINK}>
                  Get a Quote
                </button>
              </li>
              <li>
                <Link href="/#track" className={LINK}>
                  Track Shipment
                </Link>
              </li>
              <li>
                <button onClick={() => gate("/dashboard")} className={LINK}>
                  Schedule Pickup
                </button>
              </li>
              <li>
                <Link href="/#faqs" className={LINK}>
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
              Support
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-white/55">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2 text-white/55">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                <a href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`} className={LINK}>
                  {CONTACT_PHONE}
                </a>
              </li>
              <li>
                <Link href="/terms" className={LINK}>
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={LINK}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/shipping-guidelines" className={LINK}>
                  Shipping Guidelines
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Oversized wordmark, bled to the viewport edges and faded into the surface — the brand
          signs off the page. aria-hidden: the accessible name is already on the Logo above. */}
      <div
        aria-hidden
        className="mt-14 select-none overflow-hidden px-2 [-webkit-mask-image:linear-gradient(to_bottom,#000_35%,transparent_100%)] [mask-image:linear-gradient(to_bottom,#000_35%,transparent_100%)]"
      >
        <p className="whitespace-nowrap bg-gradient-to-b from-white/85 to-white/10 bg-clip-text text-center text-[clamp(2.5rem,12.5vw,10rem)] font-bold leading-[0.85] tracking-tighter text-transparent">
          NATIONWIDE
        </p>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-8">
        <div className="flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {currentYear ?? ""} NationWide Logistics. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className={LINK}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={LINK}>
              Terms
            </Link>
            <a href="#top" className="inline-flex items-center gap-1.5 text-white/55 transition-colors hover:text-white">
              Back to top
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
