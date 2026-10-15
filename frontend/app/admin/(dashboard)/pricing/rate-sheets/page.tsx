"use client";

import { BackLink } from "@/components/ui/back-link";
import { RateSheetImport } from "@/components/pricing/rate-sheet-import";

export default function RateSheetsPage() {
  return (
    <div className="space-y-4">
      <BackLink href="/admin/pricing/dashboard">Back to pricing</BackLink>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Rate sheets</h1>
        <p className="text-sm text-muted-foreground">
          Each provider&apos;s rates as their sheet lays them out. Upload the new sheet when the carrier
          sends one, check what changes, and apply.
        </p>
      </div>
      <RateSheetImport />
    </div>
  );
}
