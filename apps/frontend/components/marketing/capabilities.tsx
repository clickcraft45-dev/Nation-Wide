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
    <section className="bg-sidebar-bg py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
        {CAPABILITIES.map((item) => (
          <div key={item.label} className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-white">
              <item.icon className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-medium text-white">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
