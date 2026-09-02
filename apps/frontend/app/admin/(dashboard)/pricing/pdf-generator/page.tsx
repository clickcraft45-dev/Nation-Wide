"use client";

import { useState } from "react";
import { FileClock, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { RateCardsTab } from "@/components/pricing/rate-cards-tab";
import { RateCardHistoryTab } from "@/components/pricing/rate-card-history-tab";

type SubTab = "generate" | "history";

export default function PdfGeneratorPage() {
  const [tab, setTab] = useState<SubTab>("generate");

  return (
    <div className="page-enter space-y-5">
      <div className="glass inline-flex rounded-2xl p-1.5">
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
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 motion-reduce:transition-none",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_8px_18px_-12px_rgba(9,9,11,0.65)]"
                : "text-muted-foreground hover:bg-white/55 hover:text-foreground",
            )}
          >
            {t.key === "generate" ? <FilePlus2 className="h-4 w-4" aria-hidden /> : <FileClock className="h-4 w-4" aria-hidden />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "generate" && <RateCardsTab />}
      {tab === "history" && <RateCardHistoryTab />}
    </div>
  );
}
