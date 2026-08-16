import { Globe2, Layers, Tag, MapPinned, Eye, Headset } from "lucide-react";
import { AssetImage } from "@/components/marketing/asset-image";
import { ABOUT_IMAGE } from "@/lib/constants/assets";

const VALUE_POINTS = [
  { icon: Globe2, label: "International shipping" },
  { icon: Layers, label: "Multiple logistics & carrier options" },
  { icon: Tag, label: "Competitive pricing" },
  { icon: MapPinned, label: "Pickup coordination" },
  { icon: Eye, label: "Shipment visibility" },
  { icon: Headset, label: "Customer support" },
];

export function MarketingAbout() {
  return (
    <section id="about" className="bg-background py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
          <AssetImage src={ABOUT_IMAGE.src} alt={ABOUT_IMAGE.alt} />
        </div>

        <div>
          <h2 className="text-3xl font-semibold text-foreground">
            Shipping without the complexity
          </h2>
          <p className="mt-4 text-muted-foreground">
            NationWide Logistics connects customers with reliable shipping solutions through a
            network of trusted logistics and carrier partners — so you get transparent options
            and visibility, without having to manage the complexity yourself.
          </p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {VALUE_POINTS.map((point) => (
              <li key={point.label} className="flex items-center gap-2.5 text-sm text-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
