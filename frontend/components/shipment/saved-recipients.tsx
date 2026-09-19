"use client";

import { UserRound } from "lucide-react";
import type { SavedRecipientDto } from "@nationwide/shared-types";

/**
 * Recipients this customer has shipped to before, newest first. Tapping a name fills the address
 * form below it; a new recipient is remembered simply by booking to them.
 */
export function SavedRecipients({
  recipients,
  onPick,
}: {
  recipients: SavedRecipientDto[];
  onPick: (recipient: SavedRecipientDto) => void;
}) {
  if (recipients.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Previous recipients — tap to fill</p>
      <div className="flex flex-wrap gap-2">
        {recipients.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(r)}
            title={[r.addressLine1, r.city, r.country].filter(Boolean).join(", ")}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
          >
            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">
              {r.name} · {r.city}, {r.country}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
