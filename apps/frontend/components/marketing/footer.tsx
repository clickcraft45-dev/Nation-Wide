"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useCurrentYear } from "@/lib/utils/use-current-year";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Logo } from "@/components/brand/logo";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

export function MarketingFooter() {
  const currentYear = useCurrentYear();
  const gate = useAuthGate();

  return (
    <footer id="contact" className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="horizontal" size="sm" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delivering trust worldwide
            </p>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Reliable domestic and international shipping, with tracking built in from day
              one.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/#about" className="hover:text-foreground">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-foreground">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="hover:text-foreground">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#contact" className="hover:text-foreground">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Shipping</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <button onClick={() => gate("/quote")} className="hover:text-foreground">
                  Get a Quote
                </button>
              </li>
              <li>
                <Link href="/#track" className="hover:text-foreground">
                  Track Shipment
                </Link>
              </li>
              <li>
                <button onClick={() => gate("/dashboard")} className="hover:text-foreground">
                  Schedule Pickup
                </button>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Question about shipping")}`}
                  className="hover:text-foreground"
                >
                  FAQs
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Support</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" aria-hidden />
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" aria-hidden />
                <a href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`} className="hover:text-foreground">
                  {CONTACT_PHONE}
                </a>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/shipping-guidelines" className="hover:text-foreground">
                  Shipping Guidelines
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © {currentYear ?? ""} NationWide Logistics. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
