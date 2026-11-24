"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  KYC_DOCUMENT_LABELS,
  KYC_DOCUMENT_TYPES,
  kycNumberProblem,
  normalizeKycNumber,
  type KycDocumentDto,
  type KycDocumentType,
  type PickupRequestDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

const SELECT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * Which identity document the shipper showed, and its number: what customs reads off the
 * invoice. Kept on the customer, so a returning customer's is already filled in.
 */
export function KycDocumentFields({
  pickupId,
  apiBase,
  value,
  onChange,
  disabled,
  compact = false,
}: {
  pickupId: string;
  apiBase: string;
  value: KycDocumentDto | null;
  onChange: (updated: PickupRequestDto) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [type, setType] = useState<KycDocumentType | "">(value?.type ?? "");
  const [number, setNumber] = useState(value?.number ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saved =
    value !== null && value.type === type && value.number === normalizeKycNumber(number);
  const idPrefix = `${pickupId}-kyc`;

  async function save() {
    if (!type) {
      setError("Choose the document type.");
      document.getElementById(`${idPrefix}-type`)?.focus();
      return;
    }
    const problem = kycNumberProblem(type, number);
    if (problem) {
      setError(problem);
      document.getElementById(`${idPrefix}-number`)?.focus();
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(`${apiBase}/${pickupId}/kyc-document`, {
        type,
        number: normalizeKycNumber(number),
      });
      setNumber(normalizeKycNumber(number));
      onChange(updated);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the document. Try again."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-type`}>Document type</Label>
          <select
            id={`${idPrefix}-type`}
            value={type}
            disabled={disabled}
            onChange={(e) => setType(e.target.value as KycDocumentType)}
            className={`${SELECT_CLASS} ${compact ? "h-9" : "h-11"}`}
          >
            <option value="">Select…</option>
            {KYC_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {KYC_DOCUMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-number`}>Document number</Label>
          <Input
            id={`${idPrefix}-number`}
            value={number}
            disabled={disabled}
            onChange={(e) => setNumber(e.target.value)}
            inputMode={type === "AADHAAR" ? "numeric" : "text"}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            className={`font-mono ${compact ? "" : "h-11"}`}
            error={Boolean(error)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size={compact ? "sm" : "lg"}
          variant={saved ? "secondary" : "primary"}
          onClick={save}
          isLoading={isSaving}
          disabled={disabled || saved}
        >
          {saved ? "Saved" : value ? "Update document" : "Save document"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> On file
          </span>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
