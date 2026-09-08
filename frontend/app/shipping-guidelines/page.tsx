import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalDocument, Section } from "@/components/marketing/legal-document";
import { CONTACT_EMAIL } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Shipping Guidelines",
  description:
    "What can and cannot be shipped, size and weight limits, destination paperwork and remote " +
    "area surcharges for NationWide Logistics shipments.",
  alternates: { canonical: "/shipping-guidelines" },
};

/**
 * The operational detail behind the Terms, transcribed from the network's own booking rules
 * (docs/…SELF_rates_DHL_FEDEX.xlsx, "Self Remote"). Kept as its own page because this is the
 * list someone actually needs open while packing a parcel, and burying it inside legal terms
 * means nobody reads it until after a shipment is refused.
 */
export default function ShippingGuidelinesPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalDocument
        title="Shipping Guidelines"
        effectiveDate="8 September 2026"
        intro={
          <p>
            What we can carry, where, and what paperwork each destination needs. If your shipment
            touches anything below, talk to us before booking — it is far cheaper to check than to
            have a parcel refused at origin or seized at destination.
          </p>
        }
      >
        <Section id="not-accepted" title="We cannot carry these">
          <ul className="list-disc space-y-2 pl-5">
            <li>Anything to <strong>Russia or Ukraine</strong> — no service on any network.</li>
            <li><strong>Foodstuffs to Saudi Arabia.</strong></li>
            <li><strong>Rice and seeds to the USA and Canada.</strong> Other destinations are selective — confirm first.</li>
            <li>Electronic and electrical items on networks that refuse them, including Aramex.</li>
          </ul>
        </Section>

        <Section id="restricted" title="Restricted, or carrying extra charges">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Medicines</strong> — not accepted on our own network. Up to 500 g on DHL
              service only, with a proper medical bill and a doctor&apos;s prescription.
            </li>
            <li>
              <strong>Mehndi, oils, liquids, electronics, electric motor parts, switchboards,
              lenses, ayurvedic preparations</strong> — restricted, and extra charges apply.
            </li>
            <li>
              <strong>Singapore</strong> controls CDs, books, medicines, milk products and
              perishables.
            </li>
            <li>
              <strong>China, Indonesia, Philippines, Vietnam, Thailand, Japan, Korea and
              Taiwan</strong> — foodstuffs are accepted, but we cannot follow up on delays or
              inspections for them.
            </li>
            <li>
              <strong>South Africa</strong> — random inspections, duties, taxes and penalties may
              be applied at destination.
            </li>
          </ul>
        </Section>

        <Section id="size" title="Size, shape and weight">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Via New York (JFK), Germany and London:</strong> square boxes only, up to
              30 kg per box.
            </li>
            <li>
              <strong>Odd-dimension shipments</strong> are not accepted to the USA, Canada,
              Australia or New Zealand on branded connections.
            </li>
            <li>
              <strong>Single pieces up to 50 kg</strong> are accepted on our own network with a
              surcharge — except via DPD and via New York.
            </li>
            <li>
              <strong>Girth</strong> = length + (2 × width) + (2 × height). Over 330 cm needs
              confirmation before booking.
            </li>
            <li>
              <strong>Volumetric weight</strong> = length × width × height in cm ÷ 5000. You are
              charged on whichever is greater, actual or volumetric.
            </li>
            <li>
              <strong>Wooden boxes to Australia and New Zealand</strong> require fumigation,
              charged per piece.
            </li>
          </ul>
        </Section>

        <Section id="paperwork" title="Destination paperwork">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Brazil</strong> — a CNPJ number is compulsory for clearance.</li>
            <li>
              <strong>Saudi Arabia, Kuwait, Bahrain, Syria</strong> — a Customer Registration (CR)
              copy is required.
            </li>
            <li>
              <strong>All sectors from Mumbai customs</strong> — an Aadhaar number and signature
              are mandatory on the invoice.
            </li>
            <li><strong>Aramex</strong> — two forms of ID are compulsory on every shipment.</li>
          </ul>
        </Section>

        <Section id="remote-areas" title="Remote and extended delivery areas">
          <p>These attract a surcharge on top of the quoted rate:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>United Kingdom</strong> — Belfast, Northern Ireland, Guernsey, the Channel
              Islands and the Isle of Man.
            </li>
            <li>
              <strong>Scotland</strong> — Edinburgh, Aberdeen and Glasgow are outside standard UK
              delivery and carry a per-box surcharge.
            </li>
            <li>
              <strong>Spain</strong> — Canary Islands and Tenerife (38000–38900), Las Palmas
              (35001–35600), Ceuta and Melilla.
            </li>
            <li>
              <strong>Malaysia</strong> — Sabah and Sarawak. Not accepted on our own network above
              postcode 87000.
            </li>
            <li><strong>Dubai Free Zone</strong> — delivery charges are extra. Confirm before booking.</li>
          </ul>
          <p>
            Check remote locations before booking on connections via Germany (UPS/DHL/FedEx),
            London (FedEx/DHL/UPS) and Singapore (TNT/FedEx/DHL).
          </p>
        </Section>

        <Section id="not-part-of" title="Territories priced separately">
          <p>
            These are <em>not</em> treated as part of the country they are usually associated with,
            and are priced on their own:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Réunion</strong> is not France.</li>
            <li><strong>Netherlands Antilles and Curaçao</strong> are not the Netherlands.</li>
            <li>
              <strong>Namibia, Lesotho, Botswana and Eswatini</strong> are not South Africa.
            </li>
          </ul>
        </Section>

        <Section id="after-dispatch" title="After dispatch">
          <p>
            Address corrections attract a charge and delay delivery. On connections via Germany,
            Dubai, Singapore and London, a correction or return is handled by the carrying network
            and we are not notified in advance.
          </p>
        </Section>

        <Section id="ask" title="Not sure?">
          <p>
            Ask before you book. Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            , or read our{" "}
            <Link href="/terms" className="font-medium text-primary hover:underline">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>
      </LegalDocument>
      <MarketingFooter />
    </div>
  );
}
