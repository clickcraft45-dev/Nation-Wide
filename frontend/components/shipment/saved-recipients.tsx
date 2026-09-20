"use client";

import { UserRound } from "lucide-react";
import type { SavedRecipientDto } from "@nationwide/shared-types";

/**
 * Recipients this customer has shipped to before, newest first. Tapping a name fills the address
 * below it AND the contents last sent to them, which is what makes a repeat consignment one tap
 * rather than a retype. A new recipient is remembered simply by booking to them.
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
              {r.lastItems?.length ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {r.lastItems.length} saved item{r.lastItems.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
