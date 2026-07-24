import { Globe2, Home, Zap } from "lucide-react";

const SERVICES = [
  {
    icon: Globe2,
    title: "International Shipping",
    description:
      "Swift, secure deliveries to destinations worldwide, with full visibility from pickup to doorstep.",
  },
  {
    icon: Home,
    title: "Domestic Delivery",
    description:
      "Reliable local shipping across the country, built for speed without cutting corners.",
  },
  {
    icon: Zap,
    title: "Express Priority",
    description:
      "Time-sensitive shipments handled first — for when \"soon\" isn't fast enough.",
  },
];

export function MarketingServices() {
  return (
    <section id="services" className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">Redefining your shipping experience</h2>
          <p className="mt-3 text-muted-foreground">
            Whatever you&apos;re sending, wherever it&apos;s going — we&apos;ve got a service built for it.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <service.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{service.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
