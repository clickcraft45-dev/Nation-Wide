import { FileText, CalendarClock, PackageCheck, Truck, MapPin } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: FileText,
    title: "Get Your Quote",
    description: "Enter your shipment details and compare available options.",
  },
  {
    number: "02",
    icon: CalendarClock,
    title: "Schedule Pickup",
    description: "Choose when and where your parcel should be collected.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "We Collect",
    description: "Our pickup partner collects and verifies the parcel.",
  },
  {
    number: "04",
    icon: Truck,
    title: "We Ship",
    description: "The shipment moves through the selected logistics/carrier network.",
  },
  {
    number: "05",
    icon: MapPin,
    title: "Track",
    description: "Track the shipment using your Order ID / Tracking ID.",
  },
];

export function MarketingHowItWorks() {
  return (
    <section id="how-it-works" className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">Shipping made simple</h2>
          <p className="mt-3 text-muted-foreground">
            From quote to delivery — here&apos;s the complete journey.
          </p>
        </div>

        {/* Desktop: horizontal steps with a connecting line */}
        <div className="relative mt-14 hidden lg:grid lg:grid-cols-5 lg:gap-6">
          <div className="pointer-events-none absolute left-0 right-0 top-6 h-px bg-border" aria-hidden />
          {STEPS.map((step) => (
            <div key={step.number} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-sm">
                <step.icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-4 text-xs font-semibold tracking-wide text-primary">
                {step.number}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Mobile/tablet: vertical timeline */}
        <div className="mt-12 space-y-8 lg:hidden">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-sm">
                  <step.icon className="h-5 w-5" aria-hidden />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mt-2 w-px flex-1 bg-border" aria-hidden />
                )}
              </div>
              <div className="pb-2">
                <p className="text-xs font-semibold tracking-wide text-primary">
                  {step.number}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
