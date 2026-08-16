import { PARTNER_LOGOS } from "@/lib/constants/assets";

// Placeholder marks only — do not swap in real carrier/partner logos until they're authorized
// and supplied. Add/remove entries in lib/constants/assets.ts; this component just renders
// whatever's there.
export function MarketingTrustedNetwork() {
  return (
    <section className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Powered by trusted logistics networks
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {PARTNER_LOGOS.map((partner) => (
            // eslint-disable-next-line @next/next/no-img-element -- small static local SVG marks; no next/image sizing benefit
            <img
              key={partner.name}
              src={partner.src}
              alt={partner.name}
              loading="lazy"
              className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
