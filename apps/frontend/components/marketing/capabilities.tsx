import { Globe2, ShieldCheck, Eye, Truck } from "lucide-react";

// Capability-based, not numeric — we don't have verified figures for shipments/customers/etc.
// yet. When real statistics are available, this is the one place to add them; don't hardcode
// invented numbers here or anywhere else on the public site.
const CAPABILITIES = [
  { icon: Globe2, label: "Global Destinations" },
  { icon: ShieldCheck, label: "Trusted Logistics Network" },
  { icon: Eye, label: "End-to-End Visibility" },
  { icon: Truck, label: "Dedicated Pickup Support" },
];

export function MarketingCapabilities() {
  return (
    <section className="relative isolate overflow-hidden bg-background py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="absolute -right-20 top-0 h-80 w-80 rounded-full bg-zinc-300/40 blur-[120px] animate-aurora-slower" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 sm:grid-cols-4">
        {CAPABILITIES.map((item) => (
          <div
            key={item.label}
            className="glass-panel flex flex-col items-center rounded-2xl px-4 py-6 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <item.icon className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
