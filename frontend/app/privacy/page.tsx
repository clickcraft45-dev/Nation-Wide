import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalDocument, Section } from "@/components/marketing/legal-document";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How NationWide Logistics collects, uses, stores and shares personal data — including data " +
    "received from Google Sign-In — when you book and track a shipment.",
  alternates: { canonical: "/privacy" },
};

/**
 * Written against what this application ACTUALLY does. Every processor, scope and retention
 * period below corresponds to real code: the S3 storage service, the Brevo mail service, the ICL
 * tracking adapter, GoogleStrategy's requested scopes, the consent columns on Customer. If a data
 * flow changes, this page has to change with it — a policy describing something the software does
 * not do is worse than none, because it is a written statement to the person whose data it is.
 *
 * The "Google user data" section is deliberately its own top-level section rather than a line
 * inside "who we share with". Google's OAuth verification reviewers look for an explicit,
 * findable disclosure naming the scopes, the retention, and the Limited Use commitment; a policy
 * that merely mentions Google sign-in in passing is rejected as insufficient.
 *
 * NOT LEGAL ADVICE, and not reviewed by a lawyer. It is an accurate description of the system,
 * written to be a sound starting point for that review.
 */

function Row({ data, why, kept }: { data: string; why: string; kept: string }) {
  return (
    <tr className="border-b border-border align-top last:border-b-0">
      <td className="py-3 pr-4 font-medium text-foreground">{data}</td>
      <td className="py-3 pr-4">{why}</td>
      <td className="py-3 whitespace-nowrap">{kept}</td>
    </tr>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalDocument
        title="Privacy Policy"
        effectiveDate="8 September 2026"
        intro={
          <>
            <p>
              This policy explains what personal data NationWide Courier Delivery Service
              collects when you book, send or track a shipment, why we hold it, how long we keep
              it, who we share it with, and what you can ask us to do with it. It is written to
              the Digital Personal Data Protection Act, 2023.
            </p>
            <p className="mt-3">
              If you signed in with Google, the{" "}
              <a href="#google-user-data" className="font-medium text-primary hover:underline">
                Google user data
              </a>{" "}
              section sets out exactly what we receive from your Google Account and what we do
              with it.
            </p>
          </>
        }
      >
        <Section id="who-we-are" title="1. Who we are">
          <p>
            NationWide Courier Delivery Service is a proprietorship registered in Telangana,
            India, GSTIN 36CZWPR1095K1ZE, with its principal place of business at 80/SRT, Prakash
            Nagar, Begumpet, Secunderabad, Hyderabad, Telangana 500016. We operate the website at
            www.nationwidelogistics.co and the customer, partner and administrative applications
            hosted on it.
          </p>
          <p>
            For the purposes of the DPDP Act we are the <strong>Data Fiduciary</strong> for the
            personal data described here. You are the <strong>Data Principal</strong>.
          </p>
        </Section>

        <Section id="what-we-collect" title="2. What we collect, why, and for how long">
          <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 font-semibold text-foreground">Data</th>
                  <th className="pb-2 pr-4 font-semibold text-foreground">Why we need it</th>
                  <th className="pb-2 font-semibold text-foreground">Retention</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  data="Name, email, phone"
                  why="To create your account, identify you at sign-in, and contact you about a shipment."
                  kept="While your account is open"
                />
                <Row
                  data="Password"
                  why="To sign you in. Stored only as a bcrypt hash — we cannot read it or tell you what it is."
                  kept="While your account is open"
                />
                <Row
                  data="Pickup address"
                  why="So a pickup partner can collect the parcel from you."
                  kept="7 years (tax record)"
                />
                <Row
                  data="Recipient name, phone, address"
                  why="Passed to the carrier so the shipment can be delivered. Delivery is impossible without it."
                  kept="7 years (tax record)"
                />
                <Row
                  data="Shipment weight, dimensions, contents description"
                  why="To price the shipment and to complete the customs declaration."
                  kept="7 years (tax record)"
                />
                <Row
                  data="GSTIN"
                  why="Only if you ship as a GST-registered business, so your tax invoice is valid."
                  kept="7 years (tax record)"
                />
                <Row
                  data="Payment amount, method, date"
                  why="To record that a shipment was paid for. We never receive or store card details."
                  kept="7 years (tax record)"
                />
                <Row
                  data="Consent record"
                  why="The date and the form through which you consented, which the DPDP Act requires us to be able to show."
                  kept="While your account is open"
                />
                <Row
                  data="Delivery feedback"
                  why="Your rating and any comment, so we can improve the service."
                  kept="Until you ask us to remove it"
                />
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            We collect nothing beyond this. We do not build advertising profiles, we do not track
            you across other websites, and we do not buy personal data from third parties.
          </p>
        </Section>

        <Section id="google-user-data" title="3. Google user data">
          <p>
            Signing in with Google is optional — you can use an email address and password
            instead. If you choose it, this is exactly what happens.
          </p>
          <p>
            <strong>What we request.</strong> We ask Google for two scopes and no others:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">email</code> — your
              Google Account email address, and confirmation that Google has verified you own it.
            </li>
            <li>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">profile</code> — your
              basic profile information: display name and Google Account identifier.
            </li>
          </ul>
          <p>
            We do not request, and cannot access, your Gmail, Contacts, Drive, Calendar, or any
            other Google service.
          </p>
          <p>
            <strong>How we use it.</strong> For one purpose only: to identify which existing
            NationWide account is yours. We match the verified email address against our customer
            records and sign you in if it matches.
          </p>
          <p>
            <strong>Google Sign-In does not create an account.</strong> If the email address has
            no NationWide account, we refuse the sign-in and ask you to register normally. Nothing
            is stored from that attempt.
          </p>
          <p>
            <strong>What we store.</strong> Where the email matches an existing account, we
            already hold that email address and name because you gave them to us when you
            registered. We do <strong>not</strong> store your Google Account identifier, and we do{" "}
            <strong>not</strong> store Google access tokens or refresh tokens. Your Google password
            is never sent to us and we could not receive it.
          </p>
          <p>
            <strong>What we never do.</strong> We do not sell Google user data. We do not transfer
            it to third parties except as needed to provide the service you asked for, or where
            law requires. We do not use it for advertising, and we do not use it to train,
            develop or improve any generalised artificial intelligence or machine learning model.
          </p>
          <p className="rounded-lg border border-border bg-muted/40 p-4">
            NationWide Logistics&apos; use and transfer of information received from Google APIs to
            any other app will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p>
            <strong>Revoking access.</strong> You can disconnect NationWide Logistics from your
            Google Account at any time at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              myaccount.google.com/permissions
            </a>
            . Your NationWide account and its data are unaffected — you can still sign in with
            your email and password. To delete the underlying account data, see{" "}
            <a href="#your-rights" className="font-medium text-primary hover:underline">
              Your rights
            </a>{" "}
            below.
          </p>
        </Section>

        <Section id="sharing" title="4. Who else we share data with">
          <p>
            We share personal data only with the processors below, only for the purpose stated,
            and only what that purpose needs.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Carriers — FedEx, UPS, DHL, DPD and partner networks.</strong> The
              recipient&apos;s name, address and phone number, so the shipment can be delivered.
              They act under their own terms and privacy policies. Because international carriage
              requires it, this data reaches the destination country.
            </li>
            <li>
              <strong>ICL.</strong> Your consignment number, to retrieve tracking events. No
              personal details are sent.
            </li>
            <li>
              <strong>Brevo.</strong> Your email address and the content of transactional email —
              password resets, feedback requests, messages from our team — pass through their
              infrastructure so it can be delivered.
            </li>
            <li>
              <strong>India Post.</strong> When you type an Indian PIN code we look it up against
              their public API to fill in the city and state. Only the six-digit code is sent;
              nothing that identifies you.
            </li>
            <li>
              <strong>Amazon Web Services.</strong> Our hosting provider. Data is stored in the
              Mumbai region (ap-south-1).
            </li>
          </ul>
          <p>
            We may also disclose data where the law requires it — a court order, a customs
            authority, or a tax assessment.
          </p>
          <p>
            <strong>We do not sell your personal data</strong>, and we do not share it for anyone
            else&apos;s advertising.
          </p>
        </Section>

        <Section id="reviews" title="5. Published reviews">
          <p>
            If you leave feedback after a delivery, we may publish it on this website. When we do,
            we show your <strong>first name only</strong> alongside the comment — never your full
            name, email, phone number or any shipment detail. Nothing is published automatically;
            every review is read by a person first. Ask us and we will remove it.
          </p>
        </Section>

        <Section id="cookies" title="6. Cookies">
          <p>
            We set one cookie that matters: an httpOnly session cookie that keeps you signed in.
            It cannot be read by JavaScript, and it is cleared when you sign out. We use no
            advertising cookies, no cross-site trackers and no third-party analytics that identify
            you personally.
          </p>
        </Section>

        <Section id="your-rights" title="7. Your rights">
          <p>Under the DPDP Act you may:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>ask for a copy of the personal data we hold about you;</li>
            <li>ask us to correct anything inaccurate or incomplete;</li>
            <li>ask us to erase it;</li>
            <li>withdraw a consent you previously gave, as easily as you gave it;</li>
            <li>
              nominate another person to exercise these rights on your behalf if you are unable
              to;
            </li>
            <li>complain to the Data Protection Board of India if we handle a request poorly.</li>
          </ul>
          <p>
            <strong>Two limits, stated plainly.</strong> We cannot erase the data of a shipment
            already in transit, because the carrier needs it to complete delivery. And we cannot
            erase a tax invoice, because Indian tax law requires us to retain it — currently for
            seven years.
          </p>
          <p>
            To make any of these requests, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            . We will respond within 30 days. Account deletion removes your profile, addresses,
            saved contact details and reviews; records we are legally required to keep are
            retained and nothing else.
          </p>
        </Section>

        <Section id="security" title="8. How we protect it">
          <p>
            Traffic to this site and to our API is encrypted in transit with TLS. Passwords are
            stored only as bcrypt hashes. Access to the administrative system is role-based, and
            every change to an account, a rate or an invoice is written to an audit log naming who
            made it. Uploaded and generated files are held in private storage that is not publicly
            readable and are served only through links that expire within minutes. Password reset
            links are single-use, expire within an hour, and are stored hashed so a database leak
            yields nothing usable.
          </p>
          <p>
            No system is perfectly secure. If we become aware of a breach affecting your personal
            data, we will notify you and the Data Protection Board as the Act requires.
          </p>
        </Section>

        <Section id="children" title="9. Children">
          <p>
            This service is not intended for children under 18 and we do not knowingly create
            accounts for them. If you believe a child has given us personal data, contact us and we
            will remove it.
          </p>
        </Section>

        <Section id="changes" title="10. Changes to this policy">
          <p>
            If we change how we handle your data we will update this page and change the effective
            date at the top. Where a change is significant we will tell account holders directly
            rather than relying on you to notice.
          </p>
        </Section>

        <Section id="contact" title="11. Contact us">
          <p>
            For any privacy question or request, including anything in this policy:
          </p>
          <p>
            Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            <br />
            Phone{" "}
            <a
              href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}
              className="font-medium text-primary hover:underline"
            >
              {CONTACT_PHONE}
            </a>
            <br />
            Post: NationWide Courier Delivery Service, 80/SRT, Prakash Nagar, Begumpet,
            Secunderabad, Hyderabad, Telangana 500016, India
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
