import { AssetImage } from "@/components/marketing/asset-image";
import { WORLD_MAP_IMAGE } from "@/lib/constants/assets";

// Route lines are drawn in the same 1000x500 coordinate space as the world-map placeholder
// (see public/assets/images/world-map-placeholder.svg) so they line up with the India marker
// baked into that image. They intentionally don't label specific destination cities/countries —
// only the system's admin-configured country list is authoritative for what's actually served.
const ROUTES = [
  "M690 205 C 620 140, 540 90, 500 70",
  "M690 205 C 760 150, 820 110, 860 90",
  "M690 205 C 720 260, 760 300, 800 340",
  "M690 205 C 500 240, 350 280, 230 300",
];

export function MarketingGlobalReach() {
  return (
    <section className="bg-sidebar-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-white">Connecting India to the World</h2>
          <p className="mt-3 text-sidebar-foreground">
            Our logistics network moves shipments from India to destinations across the globe,
            backed by trusted carrier partners.
          </p>
        </div>

        <div className="relative mx-auto mt-12 aspect-[2/1] max-w-4xl">
          <AssetImage
            src={WORLD_MAP_IMAGE.src}
            alt={WORLD_MAP_IMAGE.alt}
            className="object-contain opacity-90"
          />
          <svg viewBox="0 0 1000 500" className="absolute inset-0 h-full w-full" aria-hidden>
            <g fill="none" stroke="#17B8E8" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round">
              {ROUTES.map((d) => (
                <path key={d} d={d} className="animate-route-draw" />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
