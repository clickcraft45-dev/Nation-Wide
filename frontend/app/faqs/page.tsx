import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingFaqs } from "@/components/marketing/faqs";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "FAQs",
  description:
    "Answers on prices, pickup, prohibited items, customs paperwork and tracking for international courier shipments.",
  alternates: { canonical: "/faqs" },
};

// Its own URL so search results can list it as a separate link; the same section also sits on the
// home page.
export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <h1 className="sr-only">Frequently asked questions</h1>
      <main className="flex-1">
        <MarketingFaqs />
      </main>
      <MarketingFooter />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "FAQs", path: "/faqs" }])} />
    </div>
  );
}
