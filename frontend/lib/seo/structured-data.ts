import { SITE_URL } from "@/lib/constants/site";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

/**
 * JSON-LD for the marketing site.
 *
 * Search engines read the page; structured data tells them what the business IS — that it is a
 * courier in Secunderabad with this address and this phone number, not a blog that mentions
 * couriers. For a local query like "international courier Hyderabad" that distinction is most of
 * the battle, and nothing on this site was declaring it.
 *
 * Every value below is real: the address and GSTIN come from REGISTERED_COMPANY, the phone and
 * email from the contact constants. Structured data that does not match the visible page is a
 * spam signal, so these must stay in step with what the footer and legal pages show.
 *
 * DELIBERATELY ABSENT: aggregateRating and Review markup. The Google reviews on the homepage are
 * real, but their star counts did not survive the export, so there is no honest rating to
 * publish. Inventing one to win a star snippet is exactly the fabricated-review case Google
 * penalises, and it would be a false claim to every person who sees it in the results.
 */

const ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "80/SRT, Prakash Nagar, Begumpet",
  addressLocality: "Secunderabad",
  addressRegion: "Telangana",
  postalCode: "500016",
  addressCountry: "IN",
} as const;

/** The organisation itself — used on every page via the root layout. */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    "@id": `${SITE_URL}/#organization`,
    name: "NationWide Logistics",
    legalName: "NationWide Courier Delivery Service",
    alternateName: ["NationWide Courier", "NationWide International Courier"],
    url: SITE_URL,
    logo: `${SITE_URL}/assets/logo/logo-mark.png`,
    image: `${SITE_URL}/assets/logo/logo-mark.png`,
    description:
      "International courier and cargo service in Hyderabad, shipping documents, parcels and " +
      "excess baggage from India to over 240 countries through FedEx, UPS, DHL and DPD.",
    telephone: CONTACT_PHONE,
    email: CONTACT_EMAIL,
    address: ADDRESS,
    // Begumpet, Secunderabad. Approximate to the locality, which is what a directory listing
    // gives; precise coordinates would need the actual shopfront.
    geo: {
      "@type": "GeoCoordinates",
      latitude: 17.4435,
      longitude: 78.4645,
    },
    areaServed: [
      { "@type": "City", name: "Hyderabad" },
      { "@type": "City", name: "Secunderabad" },
      { "@type": "State", name: "Telangana" },
      { "@type": "Country", name: "India" },
    ],
    currenciesAccepted: "INR",
    priceRange: "₹₹",
    taxID: "36CZWPR1095K1ZE",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "10:00",
        closes: "19:00",
      },
    ],
    knowsAbout: [
      "International courier",
      "Export documentation",
      "Customs clearance",
      "Excess baggage shipping",
      "Door-to-door delivery",
    ],
  };
}

/**
 * What the business actually sells, as a catalogue. This is what lets a query like "send parcel
 * to USA from Hyderabad" match a specific offering rather than the homepage in general.
 */
export function servicesSchema() {
  const service = (name: string, description: string) => ({
    "@type": "Service",
    name,
    description,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: { "@type": "Country", name: "India" },
    serviceType: name,
  });

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: [
      service(
        "International courier from Hyderabad",
        "Door-to-door delivery of documents and parcels from Hyderabad and Secunderabad to over 240 countries, carried by FedEx, UPS, DHL and DPD.",
      ),
      service(
        "Export cargo and freight",
        "Commercial export shipments with customs documentation, GST invoicing and end-to-end tracking.",
      ),
      service(
        "Excess baggage shipping",
        "Personal effects, clothing and household items shipped by weight for students and families moving abroad.",
      ),
      service(
        "Door pickup",
        "A pickup partner collects from your address in Hyderabad, weighs the parcel on the spot and confirms the final price before it moves.",
      ),
      service(
        "Shipment tracking",
        "Live tracking for every consignment, from pickup through customs to delivery.",
      ),
    ].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item,
    })),
  };
}

/** Turns the homepage FAQ block into a rich result. Questions must match the visible page. */
export function faqSchema(faqs: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** Breadcrumbs for the legal and guideline pages, so results show a path rather than a bare URL. */
export function breadcrumbSchema(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** The site itself, which is what enables a sitelinks search box in results. */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "NationWide Logistics",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/track?trackingNumber={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
