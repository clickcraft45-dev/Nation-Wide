import { BadgePercent, ShieldCheck, CalendarClock, Eye, Headset } from "lucide-react";

const BENEFITS = [
  {
    icon: BadgePercent,
    title: "Competitive Rates",
    description: "Compare available shipping options and choose the right service.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Logistics Network",
    description: "Shipping solutions through established logistics partners.",
  },
  {
    icon: CalendarClock,
    title: "Easy Pickup",
    description: "Convenient scheduled pickup from your location.",
  },
  {
    icon: Eye,
    title: "Shipment Visibility",
    description: "Track your shipment throughout its journey.",
  },
  {
    icon: Headset,
    title: "Human Support",
    description: "Get assistance when your shipment needs attention.",
  },
];

export function MarketingWhyChoose() {
  return (
    <section className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Why customers choose NationWide
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-xl border border-border bg-card p-6 text-center transition-shadow hover:shadow-md"
            >
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <benefit.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">{benefit.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
