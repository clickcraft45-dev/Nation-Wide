import { Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

// Placeholder testimonials — swap for real customer quotes once available.
const TESTIMONIALS = [
  {
    name: "Ananya Rao",
    role: "Small business owner",
    quote:
      "Every shipment has arrived on time, and being able to track it live takes the guesswork out completely.",
  },
  {
    name: "Vikram Shah",
    role: "E-commerce seller",
    quote:
      "Switched our whole fulfillment over to NationWide. Customer complaints about \"where's my order\" basically stopped.",
  },
  {
    name: "Fatima Sheikh",
    role: "Frequent shipper",
    quote:
      "Support actually picks up. Had an address issue mid-transit and it got sorted the same day.",
  },
];

export function MarketingTestimonials() {
  return (
    <section id="testimonials" className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">What people are saying</h2>
          <p className="mt-3 text-muted-foreground">
            We don&apos;t just move parcels — we build trust, one delivery at a time.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-card p-6">
              <div className="flex gap-0.5 text-warning">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </div>
              <p className="mt-4 text-sm text-foreground">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-5 flex items-center gap-3">
                <Avatar label={t.name} />
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
