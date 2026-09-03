"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { PincodeLookupDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type VerifyState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; place: string }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export interface PincodeInputProps extends Omit<InputProps, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /**
   * Called once a PIN resolves, with what India Post says the code belongs to. Forms use it to
   * fill City/State so the two can't disagree with the PIN the parcel is actually going to.
   */
  onResolved?: (place: { city: string; district: string; state: string }) => void;
}

/**
 * Indian PIN code field that verifies itself against India Post (via the backend's /pincodes
 * proxy) as soon as six digits are in.
 *
 * Verification is advisory, never a gate: an unreachable lookup shows "couldn't verify" and the
 * form still submits. Only a definite "no post office answers to this code" is shown as an error.
 */
export function PincodeInput({ value, onChange, onResolved, className, ...props }: PincodeInputProps) {
  const isComplete = /^[1-9][0-9]{5}$/.test(value);
  const [state, setState] = useState<VerifyState>({ kind: "idle" });

  // Reset the verdict the moment the digits change — adjusted during render (the documented
  // "state derived from props" pattern) so a stale tick or cross never survives a keystroke.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setState(isComplete ? { kind: "checking" } : { kind: "idle" });
  }

  // Ref, not a dep: parents pass a fresh closure every render, and putting it in the dep array
  // would re-run the lookup on every keystroke elsewhere in the form.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;

    // Short debounce so pasting or fast typing past six digits fires one request, not several.
    const timer = setTimeout(() => {
      apiClient
        .get<PincodeLookupDto>(`/pincodes/${value}`)
        .then((result) => {
          if (cancelled) return;
          if (!result.valid) {
            setState({ kind: "invalid" });
            return;
          }
          const place = [result.city, result.state].filter(Boolean).join(", ");
          setState({ kind: "valid", place });
          onResolvedRef.current?.({
            city: result.city ?? "",
            district: result.district ?? "",
            state: result.state ?? "",
          });
        })
        .catch((error) => {
          if (cancelled) return;
          // 400 is our own format guard; anything else means we couldn't reach India Post.
          setState(error instanceof ApiError && error.status === 400 ? { kind: "invalid" } : { kind: "unavailable" });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, isComplete]);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <Input
          {...props}
          inputMode="numeric"
          maxLength={6}
          value={value}
          // Digits only — a PIN with spaces or letters can never verify, so don't let one be typed.
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={props.error || state.kind === "invalid"}
          className="pr-9"
          aria-describedby={state.kind === "idle" ? undefined : `${props.id ?? "pincode"}-status`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          {state.kind === "checking" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          {state.kind === "valid" && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
          {state.kind === "invalid" && <XCircle className="h-4 w-4 text-danger" aria-hidden />}
        </span>
      </div>

      {state.kind !== "idle" && (
        <p
          id={`${props.id ?? "pincode"}-status`}
          role="status"
          className={cn(
            "text-xs",
            state.kind === "valid" && "text-success",
            state.kind === "invalid" && "text-danger",
            (state.kind === "checking" || state.kind === "unavailable") && "text-muted-foreground",
          )}
        >
          {state.kind === "checking" && "Checking PIN code…"}
          {state.kind === "valid" && state.place}
          {state.kind === "invalid" && "No post office found for this PIN code."}
          {state.kind === "unavailable" && "Couldn't verify this PIN code right now."}
        </p>
      )}
    </div>
  );
}
