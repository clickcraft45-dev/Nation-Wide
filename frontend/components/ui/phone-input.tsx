"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import {
  FALLBACK_DIAL_COUNTRIES,
  fetchDialCountries,
  fromE164,
  toE164,
  type DialCountry,
} from "@/lib/dial-codes";

/**
 * A phone field with its country in front of it.
 *
 * The value handed to `onChange` is always E.164 ("+919876543210") — the format the API's
 * validator requires — so callers keep storing exactly the string they stored before and no
 * server-side change is needed. Splitting the country out is purely how it is entered: asking
 * someone to type "+91" themselves is the single most common way this field got rejected.
 *
 * The country list loads from the network once per mount, falling back to a bundled list. See
 * lib/dial-codes.ts for why the fallback exists.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  error,
  disabled,
  autoComplete = "tel",
  className,
}: {
  id?: string;
  /** E.164, or "" when empty. */
  value: string;
  onChange: (e164: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  const [countries, setCountries] = useState<DialCountry[]>(FALLBACK_DIAL_COUNTRIES);
  // Only the country the user picked while the number was still empty. Once there are digits,
  // the country is read back out of `value` itself — see below.
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // One-shot lookup, not a subscription. fetchDialCountries never rejects.
    void fetchDialCountries().then((list) => {
      if (!cancelled) setCountries(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Both displayed fields are derived from `value` on every render rather than mirrored into
  // state. Mirroring needs an effect to re-sync whenever a parent supplies a different number
  // (an edit dialog loading a record, a form reset), and that effect renders once with the stale
  // number before correcting itself. Deriving has no stale frame and no effect to keep honest.
  const parsed = useMemo(() => fromE164(value, countries), [value, countries]);
  // The explicit pick wins while it still agrees with the number, so choosing "+1 US" does not
  // flip to CA on the first keystroke — several countries share a dial code and parsing alone
  // cannot tell them apart.
  const pickedDial = countries.find((c) => c.code === pickedCountry)?.dial;
  const pickedStillFits =
    pickedCountry !== null && (!value || (pickedDial ? value.startsWith(pickedDial) : false));
  const countryCode = pickedStillFits ? pickedCountry : parsed.countryCode;
  const nationalNumber = parsed.nationalNumber;
  const dial = countries.find((c) => c.code === countryCode)?.dial ?? "+91";

  function selectCountry(nextCode: string) {
    setPickedCountry(nextCode);
    const nextDial = countries.find((c) => c.code === nextCode)?.dial ?? dial;
    onChange(toE164(nextDial, nationalNumber));
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <select
        value={countryCode}
        onChange={(e) => selectCountry(e.target.value)}
        disabled={disabled}
        aria-label="Country calling code"
        className={cn(
          "w-28 shrink-0 rounded-lg border bg-background px-2 text-sm text-foreground",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-destructive" : "border-border",
        )}
      >
        {countries.map((country) => (
          // The dial code leads, because that is what someone is scanning the list for; the name
          // follows so two countries sharing +1 are still distinguishable.
          <option key={country.code} value={country.code}>
            {country.dial} {country.code}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        className="flex-1"
        placeholder="9876543210"
        value={nationalNumber}
        disabled={disabled}
        error={error}
        onChange={(e) => onChange(toE164(dial, e.target.value))}
      />
    </div>
  );
}
