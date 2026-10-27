import { PARTNER_NETWORKS } from "@/lib/constants/assets";

// The carrier networks are named, not logo'd — see the note on PARTNER_NETWORKS. Add or remove
// entries there; this component renders whatever the list contains. Four names fit on one line,
// so they sit still: the reviews below are the page's one moving belt.
export function MarketingTrustedNetwork() {
  return (
    <section className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-medium text-muted-foreground">
          Carriers we book with
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-14 gap-y-4">
          {PARTNER_NETWORKS.map((name) => (
            <li
              key={name}
              className="whitespace-nowrap text-xl font-semibold tracking-tight text-foreground/55 sm:text-2xl"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
