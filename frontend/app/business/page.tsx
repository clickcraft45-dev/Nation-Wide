import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingBusiness } from "@/components/marketing/business";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "For Business",
  description:
    "Shipping accounts for small and growing businesses: one invoice, tracked shipments and a team that answers.",
  alternates: { canonical: "/business" },
};

// Its own URL so search results can list it as a separate link; the same section also sits on the
// home page.
export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <h1 className="sr-only">Business shipping accounts</h1>
      <main className="flex-1">
        <MarketingBusiness />
      </main>
      <MarketingFooter />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "For Business", path: "/business" }])} />
    </div>
  );
}
