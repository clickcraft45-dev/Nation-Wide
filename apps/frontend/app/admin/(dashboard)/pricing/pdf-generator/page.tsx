"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { RateCardsTab } from "@/components/pricing/rate-cards-tab";
import { RateCardHistoryTab } from "@/components/pricing/rate-card-history-tab";

type SubTab = "generate" | "history";

export default function PdfGeneratorPage() {
  const [tab, setTab] = useState<SubTab>("generate");

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(
          [
            { key: "generate", label: "Generate" },
            { key: "history", label: "History" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === t.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "generate" && <RateCardsTab />}
      {tab === "history" && <RateCardHistoryTab />}
    </div>
  );
}
