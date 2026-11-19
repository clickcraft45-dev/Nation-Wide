import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { Section } from "@/components/marketing/legal-document";
import { CountryFlag } from "@/components/ui/country-flag";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/structured-data";
import { DESTINATIONS, findDestination } from "@/lib/seo/destinations";

type Props = { params: Promise<{ country: string }> };

// Rendered per request. Prerendering (generateStaticParams + dynamicParams = false) builds fine but
// 404s every country on Cloudflare: open-next.config.ts wires no incremental cache, so the Worker
// has nowhere to serve the prerendered pages from. Unknown countries still 404 via notFound().
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const destination = findDestination((await params).country);
  if (!destination) return { title: "Not found", robots: { index: false } };
  return {
    title: `Courier from Hyderabad to ${destination.name}`,
    description:
      `Send documents and parcels from Hyderabad and Secunderabad to ${destination.name} with ` +
      `DHL, FedEx and UPS. Compare prices in INR, book a door pickup and track your shipment.`,
    alternates: { canonical: `/courier-to/${destination.slug}` },
  };
}

export default async function CourierToPage({ params }: Props) {
  const destination = findDestination((await params).country);
  if (!destination) notFound();

  const faqs = [
    {
      question: `How do I send a parcel from Hyderabad to ${destination.name}?`,
      answer:
        `Pick ${destination.name} on our price page, enter the weight, and compare DHL, FedEx and UPS ` +
        `prices in INR. Choose one, schedule a door pickup in Hyderabad or Secunderabad, and our pickup ` +
        `partner weighs and collects the parcel.`,
    },
    {
      question: "Is the price I see final?",
      answer:
        "The rates shown are tentative. The final price is confirmed when your parcel is weighed at " +
        "pickup and may change accordingly.",
    },
    {
      question: `Can I track my shipment to ${destination.name}?`,
      answer:
        "Yes. You get a NationWide tracking number as soon as your parcel is accepted, and you can follow it " +
        "from pickup to delivery on our track page or over WhatsApp updates.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          <CountryFlag code={destination.code} className="mr-2" />
          Courier from Hyderabad to {destination.name}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-foreground">
          Send documents, parcels and excess baggage from Hyderabad and Secunderabad to{" "}
          {destination.name}. We resell DHL, FedEx and UPS, so you compare their prices in one
          place and deal with one company from pickup to delivery.
        </p>
        <div className="mt-6">
          <Link
            href="/prices"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            See prices to {destination.name}
          </Link>
        </div>

        <div className="mt-12 space-y-8">
          <Section id="how-it-works" title="How it works">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Choose {destination.name} and enter the parcel weight to see prices in INR.</li>
              <li>Pick the carrier and book a door pickup at a time that suits you.</li>
              <li>Our pickup partner weighs and verifies the parcel, and you pay the confirmed amount.</li>
              <li>You receive your invoice and receipt on WhatsApp and can track the shipment until it is delivered.</li>
            </ol>
            <p>The rates shown are tentative; the final price is confirmed at pickup.</p>
          </Section>

          {destination.notes.length > 0 && (
            <Section id="rules" title={`Rules for ${destination.name}`}>
              <ul className="list-disc space-y-2 pl-5">
                {destination.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p>
                Before you pack, read our{" "}
                <Link href="/shipping-guidelines" className="underline underline-offset-2">
                  shipping guidelines
                </Link>{" "}
                for prohibited goods and paperwork.
              </p>
            </Section>
          )}

          <Section id="faq" title="Questions">
            <dl className="space-y-5">
              {faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="font-medium text-foreground">{faq.question}</dt>
                  <dd className="mt-1">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="other-destinations" title="Other destinations">
            <ul className="flex flex-wrap gap-2">
              {DESTINATIONS.filter((d) => d.slug !== destination.slug).map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/courier-to/${d.slug}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <CountryFlag code={d.code} />
                    {d.name.replace(/^the /, "")}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </main>
      <MarketingFooter />
      <JsonLd data={faqSchema(faqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: `Courier to ${destination.name}`, path: `/courier-to/${destination.slug}` },
        ])}
      />
    </div>
  );
}
