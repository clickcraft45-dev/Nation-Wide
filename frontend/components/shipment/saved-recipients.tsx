"use client";

import { useId } from "react";
import type { SavedRecipientDto } from "@nationwide/shared-types";
import { Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

/**
 * Recipients this customer has shipped to before, newest first. Picking one fills the address
 * below it AND the contents last sent to them, which is what makes a repeat consignment one pick
 * rather than a retype. A new recipient is remembered simply by booking to them.
 *
 * A searchable list rather than chips: a business ships to dozens of people, and a wall of chips
 * stops being scannable long before that.
 */
export function SavedRecipients({
  recipients,
  onPick,
  id: idProp,
}: {
  recipients: SavedRecipientDto[];
  onPick: (recipient: SavedRecipientDto) => void;
  id?: string;
}) {
  const fallbackId = useId();
  if (recipients.length === 0) return null;
  const id = idProp ?? fallbackId;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Saved recipients <span className="font-normal text-muted-foreground">({recipients.length})</span>
      </Label>
      <NativeSelect
        id={id}
        searchable
        searchPlaceholder="Search name, city or country"
        // Always back on the placeholder: this is an action ("fill from"), not a stored choice.
        value=""
        onChange={(e) => {
          const picked = recipients[Number(e.target.value)];
          if (picked) onPick(picked);
        }}
      >
        <option value="">Fill from someone you have shipped to…</option>
        {recipients.map((r, i) => (
          <option key={i} value={String(i)}>
            {/* textOf() flattens these spans, so the search matches name, city and country. */}
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground">
              {" · "}
              {[r.city, r.country].filter(Boolean).join(", ")}
              {r.lastItems?.length
                ? ` · ${r.lastItems.length} saved item${r.lastItems.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
