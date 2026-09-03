import { PackageCheck, Scale, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Truck, label: "A pickup partner is assigned to you straight away" },
  { icon: Scale, label: "They weigh and check the parcel at your door" },
  { icon: PackageCheck, label: "You see the final price before you pay" },
];

/**
 * Shown when the pricing engine has no rate card covering this route, so there is no instant
 * price to compare.
 *
 * Deliberately NOT the same screen as ManualReviewNotice. That one says "our team will contact
 * you", which is a promise of a callback and an unknown wait; this path has no wait — the
 * request goes straight through to a partner and the price is set from the verified weight at
 * pickup. Telling a customer they are queued for review when they are not is worse than saying
 * nothing.
 */
export function PricedAtPickupNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Truck className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <p className="text-base font-medium text-foreground">
          We&apos;ll price this one at pickup.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This route isn&apos;t on our instant rate card, so instead of making you wait for a
          quote, we&apos;ll send someone to you and price it from the actual weight.
        </p>
      </div>

      <ol className="w-full space-y-2.5 text-left">
        {STEPS.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              aria-hidden
            >
              {index + 1}
            </span>
            <step.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {step.label}
          </li>
        ))}
      </ol>

      <Button size="lg" onClick={onContinue}>
        Continue to shipment details
      </Button>
    </div>
  );
}
