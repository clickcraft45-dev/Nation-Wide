// Central asset path configuration for the public marketing site. Every marketing image goes
// through this file rather than being hardcoded in components, so swapping in the final
// photography/logos later is a one-line change per asset — no component or layout edits.
//
// The photos are Unsplash-licensed stand-ins until NationWide has its own (sources noted on each
// set). The world map is still a hand-authored placeholder. PARTNER_NETWORKS at the bottom is not
// a placeholder; see its own note.

// Service and page photography. Free under the Unsplash License (commercial use, no attribution
// required), and like the hero set, chosen so no other carrier or retailer branding shows.
// Sources:
//   international  https://unsplash.com/photos/sWOvgOOFk1g
//   express        https://unsplash.com/photos/clYlmCaQbzY
//   pickup         https://unsplash.com/photos/MGaFENpDCsw
//   business       https://unsplash.com/photos/ZwUnAP-NLac
//   support        https://unsplash.com/photos/mHusyBu4bxM
//   login          https://unsplash.com/photos/Su1gc1A63xE (the hero air photo, at panel size)
export const SERVICE_IMAGES = {
  international: {
    src: "/assets/images/service-international.webp",
    alt: "A container port at night, cranes loading ships",
  },
  express: {
    src: "/assets/images/service-express.webp",
    alt: "A delivery rider on a scooter moving through the city",
  },
  pickup: {
    src: "/assets/images/service-pickup.webp",
    alt: "A parcel being packed on a desk, ready for collection",
  },
  business: {
    src: "/assets/images/service-business.webp",
    alt: "Two people sorting a large batch of parcels",
  },
} as const;

export const SUPPORT_IMAGE = {
  src: "/assets/images/contact-support.webp",
  alt: "A support agent on a headset call",
};

export const LOGIN_IMAGE = {
  src: "/assets/images/login-air-freight.webp",
  alt: "",
};

// Hero photography, shown beside the copy on wide screens only. Free under the Unsplash License
// (commercial use, no attribution required); chosen because none shows another carrier's or
// retailer's branding. Sources, for when they are swapped for NationWide's own photos:
//   handover   https://unsplash.com/photos/BFdSCxmqvYc
//   air        https://unsplash.com/photos/Su1gc1A63xE
//   warehouse  https://unsplash.com/photos/8wy9mGgmGoU
export const HERO_IMAGES = {
  handover: {
    src: "/assets/images/hero-parcel-handover.webp",
    alt: "A parcel being handed over at the door",
  },
  air: {
    src: "/assets/images/hero-air-freight.webp",
    alt: "An aircraft coming in to land",
  },
  warehouse: {
    src: "/assets/images/hero-warehouse.webp",
    alt: "Packed boxes staged on pallets for dispatch",
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
 * Single-ink art on a transparent background, so the file carries the SHAPE and the Logo
 * component supplies the colour: it uses the PNG as a CSS mask and paints the ink with a
 * background-colour token — brand red on light surfaces, white on the near-black panels, black
 * in print. One asset, three inks. Supply real artwork here only if the mark ever gains a
 * second colour of its own, at which point masking stops being valid.
 *
 * The SVG is a vector trace of the PNG and is what the mask uses: it stays sharp at any size and
 * on high-DPI screens. The PNG/AVIF are kept as plain-image fallbacks.
 */
export const LOGO_MARK = {
  svg: "/assets/logo/logo-mark.svg",
  avif: "/assets/logo/logo-mark.avif",
  png: "/assets/logo/logo-mark.png",
  alt: "NationWide Logistics",
} as const;

/** "NationWide. / Delivering trust worldwide" wordmark, single ink on transparency — used as a mask. */
export const TEXT_LOGO = {
  src: "/assets/logo/text-logo.png",
  alt: "NationWide — Delivering trust worldwide",
} as const;
