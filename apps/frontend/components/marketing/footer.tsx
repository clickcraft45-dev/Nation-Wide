import Link from "next/link";
import { Package, Mail, Phone } from "lucide-react";

// Placeholder contact details — replace with the real support email/phone once provided.
const CONTACT_EMAIL = "support@nationwide.example";
const CONTACT_PHONE = "+91 00000 00000";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Package className="h-4 w-4 text-white" aria-hidden />
              </div>
              <span className="text-base font-semibold text-foreground">NationWide</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Reliable domestic and international shipping, with tracking built in from day
              one.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Quick links</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#track" className="hover:text-foreground">
                  Track a shipment
                </a>
              </li>
              <li>
                <a href="#quote" className="hover:text-foreground">
                  Get a quote
                </a>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground">
                  Create account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Contact</p>
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
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} NationWide. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
