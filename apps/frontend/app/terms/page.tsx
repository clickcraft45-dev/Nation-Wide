import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalPlaceholder } from "@/components/marketing/legal-placeholder";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalPlaceholder title="Terms of Service" />
      <MarketingFooter />
    </div>
  );
}
