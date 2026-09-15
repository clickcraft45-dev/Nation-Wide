"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { lookupPostalCode } from "@/lib/google-maps";
import { Input, type InputProps } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

type VerifyState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; place: string }
  | { kind: "invalid" }
  | { kind: "unavailable" };

// Postal codes run from 3 characters (Iceland) to 10 (US ZIP+4); shorter is still being typed.
const MIN_LENGTH = 3;

/**
 * Postal / ZIP code for any country, checked worldwide as it is typed and filling City/State from
 * what the code belongs to. The non-India twin of PincodeInput, with the same rule: verification
 * is advisory — only "no such code in this country" is shown as an error, and nothing blocks the
 * form.
 */
export function PostalCodeInput({
  value,
  onChange,
  country,
  onResolved,
  className,
  ...props
}: Omit<InputProps, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** Destination country, by name or ISO code. */
  country: string;
  onResolved?: (place: { city: string; state: string }) => void;
}) {
  const code = value.trim();
  const isLookupable = code.length >= MIN_LENGTH && country.length > 0;
  const [state, setState] = useState<VerifyState>({ kind: "idle" });

  // Reset the verdict the moment the code or country changes (state derived from props).
  const key = `${country}|${code}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setState(isLookupable ? { kind: "checking" } : { kind: "idle" });
  }

  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (!isLookupable) return;
    let cancelled = false;
    // Longer than the PIN field's debounce: there is no fixed length that says "finished typing".
    const timer = setTimeout(() => {
      void lookupPostalCode(country, code).then((result) => {
        if (cancelled) return;
        if (result.kind === "found") {
          setState({ kind: "valid", place: result.formatted });
          onResolvedRef.current?.({ city: result.city, state: result.state });
        } else {
          setState({ kind: result.kind === "not-found" ? "invalid" : "unavailable" });
        }
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [country, code, isLookupable]);

  const statusId = `${props.id ?? "postal-code"}-status`;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <Input
          {...props}
          autoComplete="postal-code"
          maxLength={12}
          value={value}
          // Letters, digits, spaces and hyphens cover every national format (SW1A 1AA, 10001-1234).
          onChange={(e) => onChange(e.target.value.replace(/[^A-Za-z0-9 -]/g, "").toUpperCase().slice(0, 12))}
          error={props.error || state.kind === "invalid"}
          className="pr-9"
          aria-describedby={state.kind === "idle" ? undefined : statusId}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          {state.kind === "checking" && <Spinner size="sm" className="text-muted-foreground" />}
          {state.kind === "valid" && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
          {state.kind === "invalid" && <XCircle className="h-4 w-4 text-danger" aria-hidden />}
        </span>
      </div>
      {state.kind !== "idle" && (
        <p
          id={statusId}
          role="status"
          className={cn(
            "text-xs",
            state.kind === "valid" && "text-success",
            state.kind === "invalid" && "text-danger",
            (state.kind === "checking" || state.kind === "unavailable") && "text-muted-foreground",
          )}
        >
          {state.kind === "checking" && "Checking postal code…"}
          {state.kind === "valid" && state.place}
          {state.kind === "invalid" && `No postal code ${code} found in ${country}.`}
          {state.kind === "unavailable" && "Couldn't verify this postal code right now."}
        </p>
      )}
    </div>
  );
}
