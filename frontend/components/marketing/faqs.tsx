"use client";

import { Plus } from "lucide-react";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { SectionHeading } from "@/components/marketing/section-heading";
import { CONTACT_EMAIL } from "@/lib/constants/contact";

// Deliberately native <details>/<summary>: free keyboard support, free screen-reader semantics,
// free open/close state, and it still works with JS off. The only thing added is the grid-rows
// 0fr→1fr trick, which is how you animate a height the browser won't otherwise transition.
//
// Answers describe how the platform actually works and stop there — no invented delivery windows,
// prices or refund terms. Anything specific routes to support.
const FAQS = [
  {
    question: "How do I get a shipping quote?",
    answer:
      "Enter your pickup and destination details along with the parcel's weight and dimensions on the Get a Quote form. We compare the options available across our carrier network for that route and show you what's available, so you can pick before committing to anything.",
  },
  {
    question: "Do I need an account to track a shipment?",
    answer:
      "No. Tracking is open to everyone — enter your Order ID or Tracking ID in the panel at the top of this page and you'll see the shipment's full status history. An account is only needed to book shipments, schedule pickups and see your order history.",
  },
  {
    question: "How does pickup work?",
    answer:
      "Once your quote is confirmed you schedule a pickup with a date, time window and address. One of our pickup partners collects the parcel from you, verifies its contents and weight against the booking, and hands it into the carrier network. You'll see each of those steps reflected in tracking.",
  },
  {
    question: "What can I send?",
    answer:
      "Documents and parcels, subject to what the destination country and the carrier permit. Restricted and prohibited items vary by route, so check our Shipping Guidelines before booking — a parcel that fails a carrier's screening can be returned or held.",
  },
  {
    question: "How is shipping cost calculated?",
    answer:
      "By destination zone and chargeable weight. Chargeable weight is the greater of the parcel's actual weight and its volumetric weight (calculated from its dimensions), which is why we ask for both. Applicable fuel and surcharges are shown in the quote breakdown rather than added later.",
  },
  {
    question: "My tracking hasn't updated — what should I do?",
    answer:
      "Tracking updates when the carrier scans the parcel, so gaps are normal in transit, particularly around customs clearance and international handovers. If it's been static longer than you'd expect for the route, contact us with your Order ID and we'll chase the carrier directly.",
  },
  {
    question: "Do you ship for businesses?",
    answer:
      "Yes. If you ship regularly or in volume, get in touch rather than booking one-off quotes — we'll set you up with an account suited to recurring shipments.",
  },
];

export function MarketingFaqs() {
  return (
    <section id="faqs" className="relative isolate overflow-hidden bg-background py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-112 w-112 rounded-full bg-zinc-300/45 blur-[130px] animate-aurora-slow" />
        <div className="absolute -right-24 bottom-0 h-104 w-104 rounded-full bg-zinc-400/30 blur-[130px] animate-aurora-slower" />
        <div className="absolute inset-0 bg-hero-grid" />
      </div>

      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading
          eyebrow="Frequently asked"
          title="Questions, answered"
          description="The things people ask us most before their first shipment."
        />

        <div className="mt-12 space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              name="faqs"
              className="glass-panel group overflow-hidden rounded-2xl transition-colors duration-300 open:bg-white/75 hover:bg-white/70"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 text-left text-sm font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden sm:text-base">
                <span className="flex-1">{faq.question}</span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground/70 transition-transform duration-300 group-open:rotate-45">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
              </summary>
              {/* 0fr → 1fr is the height animation; the inner div must be overflow-hidden for it. */}
              <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr] motion-reduce:transition-none">
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                </div>
              </div>
            </details>
          ))}
        </div>

        <div className="glass-panel mt-10 flex flex-col items-center gap-4 rounded-2xl px-6 py-8 text-center">
          <p className="text-base font-medium text-foreground">Still have a question?</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Send us the details and your Order ID if you have one — we&apos;ll come back to you.
          </p>
          <LiquidButton asChild variant="primary" size="default" className="mt-1">
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Question about shipping")}`}>
              Contact support
            </a>
          </LiquidButton>
        </div>
      </div>
    </section>
  );
}
