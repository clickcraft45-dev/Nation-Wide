"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PincodeInput } from "@/components/ui/pincode-input";

/**
 * The recipient's delivery address. One component for the three places it is taken down: the
 * quote's details step, the pickup-request page, and the partner's verification at the door.
 */
export interface RecipientForm {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export type RecipientErrors = Partial<Record<keyof RecipientForm, string>>;

export const emptyRecipient: RecipientForm = {
  name: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
};

/** Prefill from whatever is already on record; missing parts stay blank. */
export function recipientFrom(
  saved: Partial<Record<keyof RecipientForm, string | null>> | null | undefined,
): RecipientForm {
  return {
    name: saved?.name ?? "",
    phone: saved?.phone ?? "",
    addressLine1: saved?.addressLine1 ?? "",
    addressLine2: saved?.addressLine2 ?? "",
    city: saved?.city ?? "",
    state: saved?.state ?? "",
    postalCode: saved?.postalCode ?? "",
  };
}

// Mirrors RecipientAddressDto's limits so a bad value is caught next to its field.
export function validateRecipient(value: RecipientForm): RecipientErrors {
  const errors: RecipientErrors = {};
  if (!value.name.trim()) errors.name = "Enter the recipient's name.";
  const phone = value.phone.trim();
  if (!phone) {
    errors.phone = "Enter the recipient's phone number.";
  } else if (!/^[+\d][\d\s-]*$/.test(phone) || phone.length > 20) {
    errors.phone = "Use digits only, with an optional leading +.";
  }
  if (!value.addressLine1.trim()) errors.addressLine1 = "Enter the delivery address.";
  if (!value.city.trim()) errors.city = "Enter a city.";
  if (!value.state.trim()) errors.state = "Enter a state or region.";
  if (!value.postalCode.trim()) errors.postalCode = "Enter a postal code.";
  return errors;
}

export function toRecipientPayload(value: RecipientForm) {
  return {
    name: value.name.trim(),
    phone: value.phone.trim(),
    addressLine1: value.addressLine1.trim(),
    addressLine2: value.addressLine2.trim() || undefined,
    city: value.city.trim(),
    state: value.state.trim(),
    postalCode: value.postalCode.trim(),
  };
}

export function RecipientFields({
  value,
  onChange,
  errors,
  isIndia,
  idPrefix = "recipient",
}: {
  value: RecipientForm;
  onChange: Dispatch<SetStateAction<RecipientForm>>;
  errors: RecipientErrors;
  /** Only Indian PIN codes can be verified; anywhere else keeps a plain field. */
  isIndia: boolean;
  idPrefix?: string;
}) {
  const field = (key: keyof RecipientForm) => ({
    id: `${idPrefix}-${key}`,
    value: value[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      onChange((prev) => ({ ...prev, [key]: next }));
    },
    error: Boolean(errors[key]),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recipient name" htmlFor={`${idPrefix}-name`} error={errors.name}>
          <Input {...field("name")} />
        </Field>
        <Field label="Recipient phone" htmlFor={`${idPrefix}-phone`} error={errors.phone}>
          <Input type="tel" {...field("phone")} />
        </Field>
      </div>
      <Field label="Address line 1" htmlFor={`${idPrefix}-addressLine1`} error={errors.addressLine1}>
        <Input {...field("addressLine1")} />
      </Field>
      <Field label="Address line 2 (optional)" htmlFor={`${idPrefix}-addressLine2`}>
        <Input {...field("addressLine2")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" htmlFor={`${idPrefix}-city`} error={errors.city}>
          <Input {...field("city")} />
        </Field>
        <Field label="State / region" htmlFor={`${idPrefix}-state`} error={errors.state}>
          <Input {...field("state")} />
        </Field>
        <Field
          label={isIndia ? "PIN code" : "Postal code"}
          htmlFor={`${idPrefix}-postalCode`}
          error={errors.postalCode}
        >
          {isIndia ? (
            <PincodeInput
              id={`${idPrefix}-postalCode`}
              value={value.postalCode}
              onChange={(postalCode) => onChange((prev) => ({ ...prev, postalCode }))}
              onResolved={({ city, state }) =>
                onChange((prev) => ({
                  ...prev,
                  city: prev.city.trim() ? prev.city : city,
                  state: prev.state.trim() ? prev.state : state,
                }))
              }
              error={Boolean(errors.postalCode)}
            />
          ) : (
            <Input {...field("postalCode")} />
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
