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

        <Section id="carriage" title="Terms and Conditions of Carriage">
          <p>
            When booking our services you, as &quot;Shipper&quot;, agree — on your own behalf and
            on behalf of anyone else with an interest in the shipment — that these carriage terms
            apply from the time we accept the shipment, unless otherwise agreed in writing by an
            authorised officer. &quot;Shipment&quot; means all documents or parcels travelling
            under one waybill, which may be carried by any means we choose, including air, road or
            any other carrier. A waybill includes any label produced by our automated systems and
            incorporates these terms.
          </p>
          <p>
            Shipments are carried on a limited-liability basis as set out below. If you require
            greater protection, value protection can be arranged at an additional cost — see
            &quot;Shipment value protection&quot;.
          </p>
        </Section>

        <Section id="carriage-customs" title="Customs, exports and imports">
          <p>
            We may, on your behalf: complete documents, amend product or service codes, and pay
            duties or taxes required under applicable law; act as your forwarding agent for customs
            and export control purposes, and as receiver solely to designate a customs broker for
            clearance and entry; and redirect the shipment to your import broker or another address
            at the request of anyone we reasonably believe is authorised to make that request.
          </p>
        </Section>

        <Section id="carriage-unacceptable" title="Unacceptable shipments">
          <p>
            You agree your shipment is acceptable for transportation, and it is deemed unacceptable
            if it is classified as hazardous material or dangerous goods, or is a prohibited or
            restricted article under IATA, ADR or any applicable government or other relevant
            regulation; if no customs declaration has been made where one is required; if it
            contains counterfeit goods, currency, bearer negotiable instruments, precious metals or
            stones, real or imitation firearms or parts of them, weapons, explosives or ammunition,
            human remains, pornography, or illegal narcotics or drugs; if it contains any other item
            we decide cannot be carried safely or legally; or if its packaging is defective or
            inadequate.
          </p>
        </Section>

        <Section id="carriage-delivery" title="Deliveries and undeliverable shipments">
          <p>
            We cannot deliver to PO boxes or postal codes alone. Shipments are delivered to the
            receiver&apos;s address as given by the shipper, but not necessarily to the named
            receiver personally; where a delivery address serves a central receiving area, delivery
            to that area is sufficient.
          </p>
          <p>
            If a shipment is deemed unacceptable, held up by customs, or the receiver cannot be
            identified or located, refuses delivery, or refuses to pay charges due on delivery, we
            will make reasonable efforts to return it to you at your cost. Failing that, we may
            dispose of or sell the shipment without any liability to you or anyone else, applying
            the proceeds against service charges and related expenses.
          </p>
        </Section>

        <Section id="carriage-inspection" title="Inspection">
          <p>We may open and inspect a shipment without notice.</p>
        </Section>

        <Section id="carriage-charges" title="Shipment charges">
          <p>
            Charges are calculated on the higher of actual or volumetric weight, and any shipment
            may be re-weighed or re-measured to confirm this. You must pay or reimburse us for all
            shipment charges, duties and taxes owed for our services, and for any claims, damages,
            fines and expenses we incur if the shipment turns out to be unacceptable as described
            above.
          </p>
        </Section>

        <Section id="carriage-liability" title="Carrier liability limits">
          <p>
            Our liability under this section is strictly limited to direct loss and damage, up to
            the limits below. All other loss or damage is excluded — including lost profits,
            income, interest and future business — whether or not it was speculative or indirect,
            and even if the risk was brought to our attention before or after we accepted the
            shipment. A shipment combining air with any other mode of transport is treated as
            carried by air.
          </p>
          <p>
            Liability for any one shipment is limited to its actual cash value and does not exceed
            USD 11.34 per lb for shipments by air or other non-road transport, or USD 12.00 per
            kilogram (USD 5.44 per lb) for shipments by road.
          </p>
          <p>
            Claims are limited to one per shipment, in full and final settlement for all loss or
            damage connected with it. If you regard these limits as insufficient, you must make a
            special declaration of value and request value protection, or arrange your own
            insurance — failing which you assume all risk of loss or damage above these limits.
          </p>
        </Section>

        <Section id="carriage-claims" title="Time limits for claims">
          <p>
            All claims must be submitted to us in writing within thirty (30) days of the date we
            accepted the shipment. We have no liability for a claim made after that.
          </p>
        </Section>

        <Section id="carriage-value-protection" title="Shipment value protection">
          <p>
            We can arrange value protection covering the actual cash value of loss of, or physical
            damage to, a shipment, provided you request it on the waybill or through our automated
            systems and pay the applicable premium. Value protection does not cover indirect loss,
            or loss or damage caused by delay.
          </p>
        </Section>

        <Section id="carriage-delay" title="Delayed shipments and money-back guarantee">
          <p>
            We make every reasonable effort to deliver according to our regular schedules, but
            those schedules are not binding and do not form part of the contract — we are not
            liable for loss or damage caused by delay. Certain services carry a money-back
            guarantee refunding transport charges for a delay, on the terms published on our
            website or available from customer service.
          </p>
        </Section>

        <Section id="carriage-force-majeure" title="Circumstances beyond our control">
          <p>
            We are not liable for loss or damage arising from circumstances beyond our control,
            including but not limited to: electrical or magnetic damage to, or erasure of,
            electronic or photographic images, data or recordings; a defect or characteristic
            inherent to the nature of the shipment; an act or omission by a person not employed or
            contracted by us — for example the shipper, receiver, a third party, or a customs or
            other government official; or force majeure such as earthquake, cyclone, storm, flood,
            war, plane crash, embargo, civil commotion or industrial action.
          </p>
        </Section>

        <Section id="carriage-conventions" title="International conventions">
          <p>
            Where a shipment travels by air with an ultimate destination or stop in a country other
            than the country of departure, the Montreal Convention or the Warsaw Convention, as
            applicable, governs. For international road transport, the Convention on the Contract
            for the International Carriage of Goods by Road (CMR) may apply. These conventions may
            govern and limit our liability for loss or damage in place of the limits above.
          </p>
        </Section>

        <Section id="carriage-warranties" title="Shipper's warranties and indemnity">
          <p>
            You indemnify and hold us harmless against any loss or damage arising from your failure
            to comply with applicable laws or regulations, or from breach of the following
            warranties:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              All information you or your representatives provided is complete and accurate (not
              available for mail services).
            </li>
            <li>The shipment was prepared in secure premises by your employees.</li>
            <li>You employed reliable staff to prepare the shipment.</li>
            <li>
              You protected the shipment against unauthorised interference during preparation,
              storage and transportation to us.
            </li>
            <li>
              The shipment is properly marked, addressed and packed to ensure safe transportation
              with ordinary care in handling.
            </li>
            <li>All applicable customs, import, export and other laws and regulations have been complied with.</li>
            <li>
              The waybill has been signed by your authorised representative, and these terms
              constitute binding and enforceable obligations on you.
            </li>
          </ul>
        </Section>

        <Section id="carriage-routing" title="Routing">
          <p>
            You agree to all routing and diversion decisions, including the possibility that the
            shipment may be carried via intermediate stopping places.
          </p>
        </Section>

        <Section id="carriage-law" title="Governing law and severability">
          <p>
            Any dispute arising under or connected with these carriage terms is subject, for our
            benefit, to the non-exclusive jurisdiction of the courts of, and governed by the law
            of, the country of origin of the shipment, and you irrevocably submit to that
            jurisdiction unless contrary to applicable law — subject to the exclusive jurisdiction
            of the courts at Hyderabad, Telangana, India.
          </p>
          <p>
            If any provision of these carriage terms is found invalid or unenforceable, the rest
            remains unaffected.
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
