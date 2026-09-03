import { Globe2, Layers, Tag, MapPinned, Eye, Headset } from "lucide-react";
import { WorldMap } from "@/components/ui/world-map";
import { SHIPPING_ROUTES } from "@/lib/constants/routes";

const VALUE_POINTS = [
  { icon: Globe2, label: "International shipping" },
  { icon: Layers, label: "Multiple logistics & carrier options" },
  { icon: Tag, label: "Competitive pricing" },
  { icon: MapPinned, label: "Pickup coordination" },
  { icon: Eye, label: "Shipment visibility" },
  { icon: Headset, label: "Customer support" },
];

// What the network actually gives a shipment. Deliberately unquantified — see the note in
// capabilities.tsx: no invented figures anywhere on the public site.
const NETWORK_FACTS = [
  { title: "Air & road lanes", detail: "Chosen per shipment" },
  { title: "Verified pickup", detail: "Collected at your door" },
  { title: "One tracking ID", detail: "Pickup through delivery" },
];

export function MarketingAbout() {
  return (
    <section id="about" className="relative isolate overflow-hidden bg-background py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-10 h-104 w-104 rounded-full bg-zinc-300/40 blur-[130px] animate-aurora-slow" />
        <div className="absolute inset-0 bg-hero-grid" />
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        {/* The page's other piece of black glass: the lanes themselves, rather than a stock
            warehouse photograph that said nothing about what NationWide actually does. */}
        <div className="glass-panel-dark relative overflow-hidden rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">The partner network</p>
              <p className="text-xs text-white/55">
                Carriers, pickup partners and customs handled as one thread
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
              Global lanes
            </span>
          </div>

          <WorldMap routes={SHIPPING_ROUTES} className="mt-6" />

          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
            {NETWORK_FACTS.map((fact) => (
              <div key={fact.title}>
                <dt className="text-xs font-semibold text-white">{fact.title}</dt>
                <dd className="mt-0.5 text-[11px] leading-snug text-white/50">{fact.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Shipping without the complexity
          </h2>
          <p className="mt-4 text-muted-foreground">
            NationWide Logistics connects customers with reliable shipping solutions through a
            network of trusted logistics and carrier partners — so you get transparent options
            and visibility, without having to manage the complexity yourself.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {VALUE_POINTS.map((point) => (
              <li
                key={point.label}
                className="glass-panel flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <point.icon className="h-4 w-4" aria-hidden />
                </span>
                {point.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
