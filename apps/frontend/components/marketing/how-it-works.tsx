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

        {/* Desktop: horizontal steps with a connecting line. The line is one continuous element
            spanning the full row (left-0 right-0), with each circle positioned on top via z-10.
            Each point mark has a solid dark-navy ring plus a soft pulsing glow (animate-point-
            twinkle, see globals.css) — staggered per step via animationDelay so they twinkle
            asynchronously rather than all pulsing in lockstep. Four small triangles travel back
            and forth along the line between each pair of circles (centered on the 20/40/60/80%
            marks — the midpoints between 5 evenly-spaced grid-cols-5 columns), pointing right and
            fading at each end of their own short travel range so the loop reset is invisible. */}
        <div className="relative mt-14 hidden lg:grid lg:grid-cols-5 lg:gap-6">
          <div className="pointer-events-none absolute left-0 right-0 top-6 h-0.5 bg-primary/25" aria-hidden />
          {[20, 40, 60, 80].map((leftPercent, i) => (
            <div
              key={leftPercent}
              className="chain-arrow-right animate-chain-arrow-x pointer-events-none absolute top-6"
              style={{ left: `${leftPercent}%`, animationDelay: `${i * 0.15}s` }}
              aria-hidden
            />
          ))}
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative flex flex-col items-center text-center">
              <div
                className="animate-point-twinkle relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-brand-navy bg-card text-brand-navy shadow-sm"
                style={{ animationDelay: `${i * 0.3}s` }}
              >
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

        {/* Mobile/tablet: vertical timeline — same dark-navy ring + twinkle treatment, running
            top-to-bottom instead of left-to-right, with a downward-pointing triangle centered on
            each connector between steps. */}
        <div className="mt-12 space-y-8 lg:hidden">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className="animate-point-twinkle flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-navy bg-card text-brand-navy shadow-sm"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  <step.icon className="h-5 w-5" aria-hidden />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="relative mt-2 w-0.5 flex-1 bg-primary/25" aria-hidden>
                    <div
                      className="chain-arrow-down animate-chain-arrow-y absolute left-1/2 top-1/2"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  </div>
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
