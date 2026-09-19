import Link from "next/link";
import { ArrowRight, Boxes, Link2, Mail, Phone, Repeat2, Users } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

const BENEFITS = [
  {
    icon: Link2,
    title: "Your own portal",
    body: "Your team signs in and books straight away — or we hand a despatch desk one standing link instead.",
  },
  {
    icon: Boxes,
    title: "Many shipments, one pickup",
    body: "Book a whole day's parcels in one go. We collect them all from your address in a single visit.",
  },
  {
    icon: Users,
    title: "Recipients saved",
    body: "Everyone you have shipped to before is one tap away, so repeat consignees are never retyped.",
  },
  {
    icon: Repeat2,
    title: "Contents remembered",
    body: "Your usual goods, values and HS codes are stored and reused on every customs declaration.",
  },
];

/**
 * The business section: what a B2B account gives a company that ships regularly, and where to ask
 * for one.
 *
 * Deliberately NO sign-up form. A business account can book shipments billed to it, so it is
 * opened by our team after a conversation — the invitation goes out by email from the admin
 * screens (see B2bAccountsService). This section's job is to make the case and hand over to the
 * contact page.
 */
export function MarketingBusiness() {
  return (
    <section id="business" className="scroll-mt-24 bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="For businesses"
          title="Shipping regularly? Open a business account."
          description="Exporters, e-commerce sellers and manufacturers book from their own portal — many shipments per pickup, with recipients and contents saved for next time."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title}>
                <Card className="h-full">
                  <CardContent className="space-y-2 pt-5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
                      <benefit.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="font-medium text-foreground">{benefit.title}</p>
                    <p className="text-sm text-muted-foreground">{benefit.body}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="lg:self-start">
            <CardContent className="space-y-4 pt-5">
              <p className="text-base font-semibold text-foreground">Ask us to set one up</p>
              <p className="text-sm text-muted-foreground">
                Tell us what you ship and how often. We open the account and email your team an
                invitation — there is no form to fill in and nothing to wait on.
              </p>
              <div className="space-y-2">
                <Link href="/contact" className={buttonVariants({ className: "w-full" })}>
                  Contact us
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`}
                  className={buttonVariants({ variant: "secondary", className: "w-full" })}
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {CONTACT_PHONE}
                </a>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Business account enquiry")}`}
                  className={buttonVariants({ variant: "secondary", className: "w-full" })}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Email us
                </a>
              </div>
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in to your portal
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
