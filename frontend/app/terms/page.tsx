import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalPlaceholder } from "@/components/marketing/legal-placeholder";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing use of the NationWide Logistics platform and the cross-border courier " +
    "services booked through it.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalPlaceholder title="Terms of Service" />
      <MarketingFooter />
    </div>
  );
}
