import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";

// The terms a sender most needs before booking, each paraphrased from app/terms/page.tsx and
// linked to its full section there. If a clause changes on that page, change it here too.
const KEY_TERMS = [
  {
    id: "quotes",
    title: "Price is confirmed at pickup",
    body: "Chargeable weight is the greater of actual and volumetric weight. Your parcel is re-weighed at the door and you see any revised price before it moves.",
  },
  {
    id: "quotes",
    title: "Destination duties are the recipient's",
    body: "Duties and taxes charged at the destination are paid by the recipient unless agreed in writing.",
  },
  {
    id: "prohibited-goods",
    title: "Some items cannot travel",
    body: "Prohibited goods are refused at pickup, or held or returned if found later. Check the list before you book.",
  },
  {
    id: "liability",
    title: "Liability and insurance",
    body: "Liability is limited to what the carrier pays or your declared value, whichever is lower. Insurance is optional and charged separately.",
  },
  {
    id: "carriage-claims",
    title: "Claims within 30 days",
    body: "Raise any claim in writing within 30 days of the date we accepted your shipment.",
  },
  {
    id: "pickup",
    title: "Transit times are estimates",
    body: "Pickups run in time slots and someone must be present. Transit times exclude customs and are not guaranteed.",
  },
];

export function MarketingTermsSummary() {
  return (
    <section id="terms" className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Terms and conditions"
          title="What you agree to when you book"
          description="The short version. The full terms always apply."
        />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {KEY_TERMS.map((term) => (
            <li key={term.title} className="bg-card">
              <Link
                href={`/terms#${term.id}`}
                className="group flex h-full flex-col gap-2 p-6 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <h3 className="text-sm font-semibold text-foreground">{term.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{term.body}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 text-center">
          <Link
            href="/terms"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Read the full Terms and Conditions
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
