import { PARTNER_NETWORKS } from "@/lib/constants/assets";

// The carrier networks are named, not logo'd — see the note on PARTNER_NETWORKS. Add or remove
// entries there; this component renders whatever the list contains.
export function MarketingTrustedNetwork() {
  return (
    <section className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Powered by trusted logistics networks
        </p>
        {/* Two identical copies scroll as one track; at -50% the second copy sits exactly where
            the first started, so the loop has no seam. The duplicate is decorative, hence hidden
            from screen readers. Edges fade out under a mask instead of being cut off. */}
        <div className="mt-8 overflow-hidden [-webkit-mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)] [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-marquee items-center gap-x-16 hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-x-16">
                {PARTNER_NETWORKS.map((name) => (
                  <span
                    key={name}
                    className="shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight text-muted-foreground/70 transition-colors hover:text-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
