import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingAbout } from "@/components/marketing/about";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Who we are: an Indian international courier and freight company that resells DHL, FedEx and UPS so you deal with one company.",
  alternates: { canonical: "/about" },
};

// Its own URL so search results can list it as a separate link; the same section also sits on the
// home page.
export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <h1 className="sr-only">About NationWide Logistics</h1>
      <main className="flex-1">
        <MarketingAbout />
      </main>
      <MarketingFooter />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "About Us", path: "/about" }])} />
    </div>
  );
}
