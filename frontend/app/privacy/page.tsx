import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalDocument, Section } from "@/components/marketing/legal-document";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How NationWide Logistics collects, uses and protects the personal data you share when " +
    "booking and tracking a shipment.",
  alternates: { canonical: "/privacy" },
};

/**
 * Written against what this application ACTUALLY does, not from a template. Every processor and
 * data item named below corresponds to real code: the S3 storage service, the Brevo mail
 * service, the ICL tracking adapter, the consent columns on Customer, the httpOnly refresh
 * cookie. If a data flow changes, this page has to change with it — a privacy policy that
 * describes something the software does not do is worse than none, because it is a written
 * statement to the person whose data it is.
 *
 * NOT LEGAL ADVICE, and not reviewed by a lawyer. It is an accurate description of the system
 * written to be a sound starting point for that review.
 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalDocument
        title="Privacy Policy"
        effectiveDate="8 September 2026"
        intro={
          <p>
            This policy explains what personal data NationWide Courier Delivery Service collects
            when you book, send or track a shipment, why we hold it, who we share it with, and
            what you can ask us to do with it. It is written to the Digital Personal Data
            Protection Act, 2023.
          </p>
        }
      >
        <Section id="who-we-are" title="Who we are">
          <p>
            NationWide Courier Delivery Service is a proprietorship registered in Telangana,
            India, GSTIN 36CZWPR1095K1ZE, with its principal place of business at 80/SRT, Prakash
            Nagar, Begumpet, Secunderabad, Hyderabad, Telangana 500016.
          </p>
          <p>
            For the purposes of the DPDP Act we are the <strong>Data Fiduciary</strong> for the
            personal data described here. You are the Data Principal.
          </p>
        </Section>

        <Section id="what-we-collect" title="What we collect">
          <p>When you create an account we collect your name, phone number and email address.</p>
          <p>
            When you request a quote or book a shipment we collect the pickup address, the
            recipient&apos;s name, phone number and full delivery address, the weight and
            description of what you are sending, and — if you are shipping as a GST-registered
            business — your GSTIN.
          </p>
          <p>
            We store your password only as a bcrypt hash. We never hold it in a readable form and
            cannot tell you what it is.
          </p>
          <p>
            If you leave feedback after a delivery we store your rating and any comment you write.
            If we publish it, we publish your first name alongside it and nothing else.
          </p>
          <p>
            We do not collect payment card details. We record that a payment was made, its amount
            and method, not the instrument used.
          </p>
        </Section>

        <Section id="why" title="Why we hold it">
          <p>
            A courier cannot function without this data: an address is how a parcel arrives, a
            phone number is how a partner reaches you at the door, and a recipient&apos;s details
            are what the destination carrier needs to complete delivery.
          </p>
          <p>
            We record when and how you consented — the consent form you used and the date — so we
            can show the basis on which we hold your data, as the DPDP Act requires.
          </p>
          <p>
            Tax invoices are a statutory record. We keep them for as long as GST law requires,
            which is longer than we keep anything else, and they are not deleted on request.
          </p>
        </Section>

        <Section id="sharing" title="Who we share it with">
          <p>
            <strong>Carriers.</strong> To move your shipment we pass the recipient&apos;s name,
            address and phone number to the carrier handling it — FedEx, UPS, DHL, or a partner
            network. They process it under their own terms and their own privacy policies.
          </p>
          <p>
            <strong>Tracking.</strong> We query ICL&apos;s tracking service using your consignment
            number to show you where a shipment is.
          </p>
          <p>
            <strong>Email.</strong> Transactional email — password resets, delivery feedback
            requests, messages from our team — is sent through Brevo. Your email address and the
            content of that message pass through their infrastructure.
          </p>
          <p>
            <strong>Address lookup.</strong> When you enter an Indian PIN code we look it up
            against India Post&apos;s public API to fill in the city and state. Only the PIN code
            is sent; nothing that identifies you.
          </p>
          <p>
            <strong>Sign-in.</strong> If you choose to sign in with Google, Google confirms your
            email address to us. We receive your name and email and nothing further, and we never
            receive your Google password.
          </p>
          <p>
            We do not sell your personal data, and we do not share it for anyone else&apos;s
            advertising.
          </p>
        </Section>

        <Section id="where" title="Where it is stored">
          <p>
            Our database and file storage run on Amazon Web Services in the Mumbai region
            (ap-south-1). Documents such as invoice PDFs are held in a private bucket that is not
            publicly readable; where you are shown one, it is through a link that expires within
            minutes.
          </p>
          <p>
            Because international shipping requires it, data about a shipment necessarily reaches
            the destination country when the carrier moves it there.
          </p>
        </Section>

        <Section id="cookies" title="Cookies">
          <p>
            We set one cookie that matters: an httpOnly session cookie that keeps you signed in.
            It cannot be read by JavaScript, and it is cleared when you sign out. We do not use
            advertising or cross-site tracking cookies.
          </p>
        </Section>

        <Section id="your-rights" title="Your rights">
          <p>
            Under the DPDP Act you may ask us for a copy of the personal data we hold about you,
            ask us to correct anything inaccurate, ask us to erase it, or withdraw a consent you
            previously gave. You may also nominate someone to exercise these rights on your behalf
            if you are unable to.
          </p>
          <p>
            Two limits worth stating plainly. We cannot erase data from a shipment already in
            transit, because the carrier needs it to complete delivery. And we cannot erase a tax
            invoice, because we are required by law to keep it.
          </p>
          <p>
            Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and we will respond. If you are not satisfied with how we handle your request, you may
            complain to the Data Protection Board of India.
          </p>
        </Section>

        <Section id="security" title="Security">
          <p>
            Traffic to this site and our API is encrypted in transit. Passwords are hashed, never
            stored. Access to the admin system is role-based and every change to an account or a
            rate is written to an audit log. Files are held in private storage and served only
            through short-lived links.
          </p>
          <p>
            No system is perfectly secure. If we ever become aware of a breach affecting your
            personal data, we will notify you and the Data Protection Board as the Act requires.
          </p>
        </Section>

        <Section id="children" title="Children">
          <p>
            Our service is not intended for children under 18, and we do not knowingly create
            accounts for them. If you believe a child has given us personal data, contact us and we
            will remove it.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If we change how we handle your data we will update this page and change the effective
            date at the top. Where a change is significant we will tell account holders directly
            rather than relying on you to notice.
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
            <Link href="/terms" className="font-medium text-primary hover:underline">
              Terms &amp; Conditions
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
