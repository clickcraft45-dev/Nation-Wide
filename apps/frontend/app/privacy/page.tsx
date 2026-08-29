import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalPlaceholder } from "@/components/marketing/legal-placeholder";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How NationWide Logistics collects, uses and protects the personal data you share when " +
    "booking and tracking a shipment.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalPlaceholder title="Privacy Policy" />
      <MarketingFooter />
    </div>
  );
}
