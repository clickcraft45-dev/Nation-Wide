import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalDocument, Section } from "@/components/marketing/legal-document";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms on which NationWide Courier Delivery Service accepts, carries and delivers " +
    "shipments, including prohibited items, pricing and liability.",
  alternates: { canonical: "/terms" },
};

/**
 * Grounded in this business's actual operating rules rather than generic carriage boilerplate.
 * The restrictions in "What we cannot carry" are transcribed from the network's own booking
 * rules (docs/…SELF_rates_DHL_FEDEX.xlsx, "Self Remote"), and the pricing section describes the
 * quote engine as it really behaves — options expire, weight is re-verified at pickup, and the
 * price can change as a result.
 *
 * NOT LEGAL ADVICE, and not reviewed by a lawyer. Liability limits especially should be checked
 * against the carriage contracts actually in force before this is relied on.
 */
export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalDocument
        title="Terms & Conditions"
        effectiveDate="8 September 2026"
        intro={
          <p>
            These terms govern shipments booked with NationWide Courier Delivery Service, whether
            through this website or by arrangement with our team. By booking a shipment you accept
            them.
          </p>
        }
      >
        <Section id="who" title="Who you are contracting with">
          <p>
            NationWide Courier Delivery Service, a proprietorship registered in Telangana, India,
            GSTIN 36CZWPR1095K1ZE, at 80/SRT, Prakash Nagar, Begumpet, Secunderabad, Hyderabad,
            Telangana 500016.
          </p>
          <p>
            We arrange international carriage through partner networks including FedEx, UPS, DHL
            and DPD. Your shipment is also subject to the carrying network&apos;s own conditions of
            carriage, and where those conflict with a claim about the physical movement of goods,
            theirs govern.
          </p>
        </Section>

        <Section id="quotes" title="Quotes and pricing">
          <p>
            A quote is an estimate based on the weight, destination and shipment type you enter. It
            is not a fixed price until the shipment is collected and weighed.
          </p>
          <p>
            <strong>Chargeable weight is the greater of actual and volumetric weight.</strong>{" "}
            Volumetric weight is length × width × height in centimetres divided by 5000. Any
            fraction of a kilogram is rounded up to the next step.
          </p>
          <p>
            Our pickup partner re-weighs and re-measures your parcel at collection. If it differs
            from what you entered, the price is recalculated and you are shown the revised figure
            before the shipment proceeds.
          </p>
          <p>
            Quoted prices exclude fuel surcharge and GST unless stated otherwise. Fuel surcharge is
            set by the carrying network and changes frequently. Duties and taxes at the destination
            are payable by the recipient unless agreed in writing.
          </p>
          <p>
            Rate quotes expire. Where an expiry is shown on your quote, the price is not held after
            that time.
          </p>
        </Section>

        <Section id="prohibited" title="What we cannot carry">
          <p>
            Some items and destinations we cannot accept at all; others need paperwork or attract
            extra charges. Confirm with us before booking if any of this applies to your shipment.
          </p>
          <p>
            <strong>Not accepted:</strong> shipments to Russia and Ukraine. Foodstuffs to Saudi
            Arabia. Electronic and electrical items on networks that refuse them. Rice and seeds to
            the USA and Canada.
          </p>
          <p>
            <strong>Restricted, or carrying extra charges:</strong> medicines (limited quantity,
            with a prescription and doctor&apos;s documentation, on specific services only); mehndi,
            oils and liquids; electronics, motor parts, switchboards and lenses; ayurvedic
            preparations. Controlled into Singapore: CDs, books, medicines, milk products and
            perishables.
          </p>
          <p>
            <strong>Size and shape limits:</strong> routes via New York, Germany and London accept
            square-shaped boxes up to 30 kg per box. Odd-dimension shipments to the USA, Canada,
            Australia and New Zealand are not accepted on branded connections. Single pieces up to
            50 kg are accepted on our own network, with a surcharge, except via DPD and via New
            York. Girth — length plus twice the width plus twice the height — over 330 cm needs
            confirmation before booking.
          </p>
          <p>
            <strong>Destination paperwork:</strong> Brazil requires a CNPJ number for clearance.
            Saudi Arabia, Kuwait, Bahrain and Syria require a Customer Registration copy. Wooden
            boxes to Australia and New Zealand require fumigation, charged per piece. Mumbai
            customs requires an Aadhaar number and signature on the invoice for all sectors.
          </p>
          <p>
            You are responsible for the accuracy and legality of what you declare. Where a shipment
            is seized, returned or penalised because of a wrong or incomplete declaration, those
            costs are yours.
          </p>
        </Section>

        <Section id="remote" title="Remote and extended delivery areas">
          <p>
            Some destinations sit outside a carrier&apos;s standard delivery area and attract a
            surcharge. This includes, among others, Belfast, Northern Ireland, Guernsey, the
            Channel Islands and the Isle of Man; Edinburgh, Aberdeen and Glasgow; the Canary
            Islands, Tenerife, Las Palmas, Ceuta and Melilla in Spain; and Sabah and Sarawak in
            Malaysia.
          </p>
          <p>
            Several territories are not treated as part of the country they are associated with —
            Réunion is not France, the Netherlands Antilles and Curaçao are not the Netherlands,
            and Namibia, Lesotho, Botswana and Eswatini are not South Africa. They are priced
            separately.
          </p>
          <p>
            Where the destination address falls in an extended area, the surcharge is added to the
            price. We will tell you before the shipment moves wherever we can identify it in
            advance.
          </p>
        </Section>

        <Section id="pickup" title="Pickup and delivery">
          <p>
            Pickups are scheduled in time slots and are attempted, not guaranteed to the minute.
            Someone must be present at the address to hand over the parcel.
          </p>
          <p>
            Transit times quoted anywhere on this site are estimates based on normal conditions.
            They are not guarantees, and they exclude time spent in customs.
          </p>
          <p>
            Address corrections after dispatch attract a charge and may delay delivery. On
            connections via Germany, Dubai, Singapore and London, a correction or return is
            processed by the carrying network without prior notification to us.
          </p>
        </Section>

        <Section id="liability" title="Liability">
          <p>
            Our liability for loss of or damage to a shipment is limited to the amount recoverable
            from the carrying network under its conditions of carriage, or the declared value of
            the shipment, whichever is lower.
          </p>
          <p>
            We are not liable for indirect or consequential loss, including loss of profit or
            opportunity, or for delay, seizure or destruction by customs or any other authority.
          </p>
          <p>
            Insurance is available and is charged separately. Where you have not declared a value
            and paid for cover, the shipment is carried uninsured.
          </p>
          <p>
            Claims must be raised with us in writing promptly, and are subject to the carrying
            network&apos;s own claim windows, which can be short.
          </p>
        </Section>

        <Section id="payment" title="Payment">
          <p>
            Charges are payable as agreed at booking — at pickup, or on invoice where credit terms
            are in place. GST applies at the prevailing rate and is shown on your tax invoice.
          </p>
          <p>
            Where a re-weigh at pickup increases the price, the revised amount is payable before
            the shipment moves.
          </p>
        </Section>

        <Section id="accounts" title="Your account">
          <p>
            Keep your password to yourself. You are responsible for what happens under your
            account. Tell us immediately if you think someone else has access to it.
          </p>
          <p>
            We may suspend or close an account used for fraudulent or unlawful shipping.
          </p>
        </Section>

        <Section id="law" title="Governing law">
          <p>
            These terms are governed by the laws of India. Courts at Hyderabad, Telangana have
            exclusive jurisdiction.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            or call{" "}
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`} className="font-medium text-primary hover:underline">
              {CONTACT_PHONE}
            </a>
            .
          </p>
          <p>
            See also our{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/shipping-guidelines" className="font-medium text-primary hover:underline">
              Shipping Guidelines
            </Link>
            .
          </p>
        </Section>
      </LegalDocument>
      <MarketingFooter />
    </div>
  );
}
