import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";
import { REGISTERED_COMPANY } from "@nationwide/shared-types";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Talk to NationWide Logistics about international shipping, business accounts and bulk pickups — phone, email and office address.",
  alternates: { canonical: "/contact" },
};

const OFFICE_HOURS = "Monday – Saturday, 9:00 AM – 7:00 PM IST";

// The registered address is the one on the GST certificate (shared-types), so this page and every
// generated invoice name the same place — there is no second copy to fall out of date.
const ADDRESS_LINES = [
  REGISTERED_COMPANY.companyName,
  ...REGISTERED_COMPANY.address.split(",").map((line) => line.trim()),
].filter(Boolean);

const CHANNELS = [
  {
    icon: Phone,
    label: "Phone",
    value: CONTACT_PHONE,
    href: `tel:${CONTACT_PHONE.replace(/\s+/g, "")}`,
    note: "Fastest for a quote or a pickup running late.",
  },
  {
    icon: Mail,
    label: "Email",
    value: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    note: "Send documents, rate requests or an account enquiry.",
  },
];

/**
 * Where every "talk to us" route lands, including the business section on the homepage: a business
 * account is opened by our team, not self-served, so the homepage sends them here rather than
 * asking them to fill in a form that creates nothing.
 */
export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />

      <main className="flex-1 bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <SectionHeading
            eyebrow="Contact"
            title="Talk to us"
            description="Rates, a pickup that needs chasing, or opening a business account — a person answers."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              {CHANNELS.map((channel) => (
                <Card key={channel.label}>
                  <CardContent className="flex items-start gap-4 pt-5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
                      <channel.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {channel.label}
                      </p>
                      <a
                        href={channel.href}
                        className="block break-words text-lg font-semibold text-foreground hover:text-primary"
                      >
                        {channel.value}
                      </a>
                      <p className="mt-1 text-sm text-muted-foreground">{channel.note}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Card>
                <CardContent className="flex items-start gap-4 pt-5">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
                    <Clock className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Office hours
                    </p>
                    <p className="text-base font-medium text-foreground">{OFFICE_HOURS}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pickups run in three slots: 9–12, 12–3 and 3–6.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent className="flex items-start gap-4 pt-5">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
                    <MapPin className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Office</p>
                    <address className="not-italic text-base font-medium leading-relaxed text-foreground">
                      {ADDRESS_LINES.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </address>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        ADDRESS_LINES.join(", "),
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                    >
                      Open in Google Maps
                    </a>
                    <p className="mt-3 text-sm text-muted-foreground">
                      GSTIN {REGISTERED_COMPANY.gstin}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-5">
                  <p className="text-base font-semibold text-foreground">Business accounts</p>
                  <p className="text-sm text-muted-foreground">
                    Shipping regularly? Call or email us and we will set up an account for your
                    team: book many shipments in one pickup, with your addresses and usual contents
                    saved. We send the invitation — there is nothing to sign up for here.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                        "Business account enquiry",
                      )}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Email us about an account
                    </a>
                    <Link
                      href="/login"
                      className={buttonVariants({ size: "sm", variant: "secondary" })}
                    >
                      Business sign in
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
