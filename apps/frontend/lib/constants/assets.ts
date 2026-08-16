// Central asset path configuration for the public marketing site. Every marketing image goes
// through this file rather than being hardcoded in components, so swapping in the final
// photography/logos later is a one-line change per asset — no component or layout edits.
//
// Everything here is currently a hand-authored placeholder (see apps/frontend/public/assets/) —
// swap the path (and, where the final asset is a photo, the extension to .webp/.avif) once real
// assets are supplied.

// Separate mobile/desktop hero art so the mobile crop is composed for its own aspect ratio
// rather than an automatic crop of the desktop image. Both point at placeholders today; swap
// each independently once real photography is supplied (e.g. hero-mobile.webp / hero-desktop.webp).
export const HERO_IMAGE = {
  mobile: {
    src: "/assets/images/hero-mobile-placeholder.svg",
    alt: "Illustration of global logistics — air, ocean and road freight moving parcels worldwide",
  },
  desktop: {
    src: "/assets/images/hero-logistics-placeholder.svg",
    alt: "Illustration of global logistics — air, ocean and road freight moving parcels worldwide",
  },
};

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

export const ABOUT_IMAGE = {
  src: "/assets/images/about-logistics-placeholder.svg",
  alt: "NationWide Logistics network operations",
};

export const WORLD_MAP_IMAGE = {
  src: "/assets/images/world-map-placeholder.svg",
  alt: "World map showing NationWide Logistics' global reach",
};

// Placeholder partner marks — replace with authorized carrier/partner logos once provided.
// Add or remove entries here; PartnerNetwork renders whatever this array contains.
export const PARTNER_LOGOS = [
  { name: "Partner network 1", src: "/assets/partners/partner-placeholder-01.svg" },
  { name: "Partner network 2", src: "/assets/partners/partner-placeholder-02.svg" },
  { name: "Partner network 3", src: "/assets/partners/partner-placeholder-03.svg" },
  { name: "Partner network 4", src: "/assets/partners/partner-placeholder-04.svg" },
] as const;
