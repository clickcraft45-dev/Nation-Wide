"use client";

import { useState } from "react";
import { History, Upload } from "lucide-react";
import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";
import { RateHistoryDialog } from "@/components/pricing/rate-history-dialog";

type Provider = { id: string; code: string; name: string };

/** The provider's live rates as the workbook the rate-sheet import reads straight back. */
export function ExportRateSheetButton({ provider, className }: { provider: Provider; className?: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const { showToast } = useToast();

  async function exportSheet() {
    setIsExporting(true);
    try {
      const { blob, headers } = await apiClient.getBlob(`/admin/pricing/providers/${provider.id}/rate-sheet/export`);
      const name =
        /filename="([^"]+)"/.exec(headers.get("Content-Disposition") ?? "")?.[1] ??
        `${provider.code.toLowerCase()}-rates.xlsx`;
      downloadBlob(blob, name);
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, `Couldn't export ${provider.name}'s rates.`) });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      onClick={exportSheet}
      isLoading={isExporting}
      aria-label={`Export ${provider.name} rates to Excel`}
    >
      <Upload className="h-4 w-4" aria-hidden />
      Export
    </Button>
  );
}

/** One line per rate-sheet import or export, from the audit row the backend writes for each. */
export function describeRateSheetEntry(entry: AuditLogEntryDto): string {
  const a = (entry.after ?? {}) as Record<string, unknown>;
  const kind = a.allIn ? "all-in" : "normal";
  if (entry.action === "EXPORT") {
    return `Exported ${kind} rates: ${a.bands ?? 0} weight rows, ${a.countries ?? 0} countries`;
  }
  return (
    `Imported ${a.fileName ? String(a.fileName) : "a rate sheet"} as ${kind}: ${a.bandsUpdated ?? 0} changed, ` +
    `${a.bandsCreated ?? 0} added, ${a.bandsDeactivated ?? 0} switched off, ${a.countriesLinked ?? 0} countries linked` +
    (Number(a.countriesAdded) > 0 ? `, ${String(a.countriesAdded)} new destinations added` : "")
  );
}

export function RateSheetHistoryButton({ provider }: { provider: Provider }) {
  return (
    <RateHistoryDialog
      rateId={provider.id}
      entity="RateSheet"
      title={`${provider.name} rate sheet imports and exports`}
      describe={describeRateSheetEntry}
      trigger={
        <Button variant="ghost" size="sm">
          <History className="h-4 w-4" aria-hidden />
          Sheet history
        </Button>
      }
    />
  );
}
