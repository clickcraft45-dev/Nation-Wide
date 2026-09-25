// Carriers' public tracking pages, keyed by ShippingProvider.code. These URLs are stable, public
// and identical for every NationWide install, so they live in code rather than in provider config
// or another admin screen nobody would ever edit.
// ponytail: a hardcoded map; move it into ShippingProvider.config if a carrier ever needs a
// per-account tracking URL.
const TRACKING_PAGES: Record<string, (awb: string) => string> = {
  DHL: (awb) =>
    `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${awb}`,
  FEDEX: (awb) => `https://www.fedex.com/fedextrack/?trknbr=${awb}`,
  UPS: (awb) => `https://www.ups.com/track?loc=en_IN&tracknum=${awb}`,
  DPD: (awb) => `https://www.dpd.co.uk/apps/tracking/?reference=${awb}`,
  ARAMEX: (awb) => `https://www.aramex.com/us/en/track/results?ShipmentNumber=${awb}`,
};

/** null for a carrier with no public tracking page — resellers like ICL have none. */
export function carrierTrackingUrl(
  providerCode: string,
  externalTrackingNumber: string,
): string | null {
  const build = TRACKING_PAGES[providerCode.toUpperCase()];
  return build ? build(encodeURIComponent(externalTrackingNumber)) : null;
}
