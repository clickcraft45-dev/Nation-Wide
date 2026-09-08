// Central asset path configuration for the public marketing site. Every marketing image goes
// through this file rather than being hardcoded in components, so swapping in the final
// photography/logos later is a one-line change per asset — no component or layout edits.
//
// The images here are hand-authored placeholders (see frontend/public/assets/) — swap the
// path, and where the final asset is a photo the extension to .webp/.avif, once real assets are
// supplied. PARTNER_NETWORKS at the bottom is not a placeholder; see its own note.

export const SERVICE_IMAGES = {
  international: {
    src: "/assets/images/service-international-placeholder.svg",
    alt: "International shipping",
  },
  express: {
    src: "/assets/images/service-express-placeholder.svg",
    alt: "Express delivery",
  },
  pickup: {
    src: "/assets/images/service-pickup-placeholder.svg",
    alt: "Pickup and door-to-door service",
  },
  business: {
    src: "/assets/images/service-business-placeholder.svg",
    alt: "Business shipping",
  },
} as const;

export const WORLD_MAP_IMAGE = {
  src: "/assets/images/world-map-placeholder.svg",
  alt: "World map showing NationWide Logistics' global reach",
};

// The carrier networks NationWide actually quotes and books against — the same four rate
// providers the pricing engine is seeded with (backend/prisma/seed.ts). Rendered as plain
// text wordmarks, deliberately: reproducing a carrier's trademarked logo art needs their
// authorisation, whereas naming the carriers you genuinely resell does not. The rail used to
// show four grey placeholder SVGs, which on a live site read as logos that had failed to load.
export const PARTNER_NETWORKS = ["DHL", "DHL Express", "FedEx", "UPS"] as const;

/**
 * The company mark — the NW monogram with the globe and aircraft.
 *
 * Single-ink black art on a transparent background, which is what makes the `reverse` variant
 * possible: on the dark sidebar and hero panels the Logo component inverts it to white rather
 * than needing a second file. Supply a real white asset here only if the mark ever stops being
 * one flat ink.
 *
 * AVIF first with PNG as the fallback — the AVIF is roughly a sixth of the size, and every
 * browser that cannot read it gets the PNG from the same <picture>.
 */
export const LOGO_MARK = {
  avif: "/assets/logo/logo-mark.avif",
  png: "/assets/logo/logo-mark.png",
  alt: "NationWide Logistics",
} as const;
