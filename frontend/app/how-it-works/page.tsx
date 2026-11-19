import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHowItWorks } from "@/components/marketing/how-it-works";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Get a price, book a door pickup in Hyderabad, and track your international parcel from pickup to delivery.",
  alternates: { canonical: "/how-it-works" },
};

// Its own URL so search results can list it as a separate link; the same section also sits on the
// home page.
export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <h1 className="sr-only">How shipping with us works</h1>
      <main className="flex-1">
        <MarketingHowItWorks />
      </main>
      <MarketingFooter />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "How It Works", path: "/how-it-works" }])} />
    </div>
  );
}
