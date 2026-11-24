"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import type { PostalLookupDto, PostalPlaceDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Input, type InputProps } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

type VerifyState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; place: PostalPlaceDto }
  /** The code exists in several countries and none is chosen yet. */
  | { kind: "choose"; places: PostalPlaceDto[] }
  | { kind: "invalid"; elsewhere: PostalPlaceDto[] }
  | { kind: "unavailable" };

// Postal codes run from 3 characters (Iceland) to 10 (US ZIP+4); shorter is still being typed.
const MIN_LENGTH = 3;

/** Where the city and state came from, as one line: "New York, New York, United States". */
function describe(place: PostalPlaceDto): string {
  return [place.city, place.state && place.state !== place.city ? place.state : null, place.countryName]
    .filter(Boolean)
    .join(", ");
}

/** The backend's worldwide lookup (India Post, GeoNames, Google). */
export function lookupPostal(code: string, country?: string): Promise<PostalLookupDto> {
  const params = new URLSearchParams({ code });
  if (country) params.set("country", country);
  return apiClient.get<PostalLookupDto>(`/postal-codes?${params.toString()}`);
}

/**
 * Postal / ZIP code for any country, looked up worldwide as it is typed, filling the city and
 * state from what the code belongs to.
 *
 * `canChooseCountry`: the country is not fixed here (the partner at the door on a booking with no
 * destination, staff booking a pickup), so the code may also set it. With no country chosen, the
 * code is searched everywhere: one match sets the country; a code that exists in several asks
 * which. Where the country IS fixed (it was priced for it), a code from another country only
 * warns, because changing the country would change the price.
 *
 * Advisory, like the PIN field: nothing here blocks the form.
 */
export function PostalCodeInput({
  value,
  onChange,
  country,
  onResolved,
  canChooseCountry = false,
  className,
  ...props
}: Omit<InputProps, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** Destination country, by name or ISO code. Empty searches every country (see above). */
  country: string;
  /** The place the code belongs to, including its country. */
  onResolved?: (place: PostalPlaceDto) => void;
  canChooseCountry?: boolean;
}) {
  const code = value.trim();
  const isLookupable = code.length >= MIN_LENGTH && (country.length > 0 || canChooseCountry);
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
      lookupPostal(code, country || undefined)
        .then((result) => {
          if (cancelled) return;
          if (result.status === "FOUND" && result.places.length === 1) {
            setState({ kind: "valid", place: result.places[0] });
            onResolvedRef.current?.(result.places[0]);
          } else if (result.status === "FOUND") {
            setState({ kind: "choose", places: result.places });
          } else if (result.status === "NOT_FOUND") {
            setState({ kind: "invalid", elsewhere: result.elsewhere });
          } else {
            setState({ kind: "unavailable" });
          }
        })
        .catch(() => {
          if (!cancelled) setState({ kind: "unavailable" });
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [country, code, isLookupable]);

  function pick(place: PostalPlaceDto) {
    setState({ kind: "valid", place });
    onResolvedRef.current?.(place);
  }

  const statusId = `${props.id ?? "postal-code"}-status`;
  const chipClass =
    "min-h-9 rounded-full border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted";

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
          {state.kind === "choose" && <TriangleAlert className="h-4 w-4 text-warning" aria-hidden />}
          {state.kind === "invalid" && <XCircle className="h-4 w-4 text-danger" aria-hidden />}
        </span>
      </div>
      {state.kind !== "idle" && (
        <div id={statusId} role="status" className="space-y-1.5 text-xs">
          {state.kind === "checking" && <p className="text-muted-foreground">Looking up the postal code…</p>}
          {state.kind === "valid" && <p className="text-success">{describe(state.place)}</p>}
          {state.kind === "unavailable" && (
            <p className="text-muted-foreground">Couldn&apos;t look up this postal code right now. Type the city and state.</p>
          )}
          {state.kind === "choose" && (
            <>
              <p className="text-warning">{code} exists in more than one country. Which one?</p>
              <div className="flex flex-wrap gap-1.5">
                {state.places.map((place) => (
                  <button key={place.countryCode} type="button" className={chipClass} onClick={() => pick(place)}>
                    {describe(place)}
                  </button>
                ))}
              </div>
            </>
          )}
          {state.kind === "invalid" &&
            (state.elsewhere.length === 0 ? (
              <p className="text-danger">
                No postal code {code} found{country ? ` in ${country}` : ""}.
              </p>
            ) : canChooseCountry ? (
              <>
                <p className="text-danger">
                  {code} is not a postal code in {country}. Did you mean:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {state.elsewhere.map((place) => (
                    <button key={place.countryCode} type="button" className={chipClass} onClick={() => pick(place)}>
                      {describe(place)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-danger">
                {code} is a postal code in {state.elsewhere.map((p) => p.countryName).join(" or ")}, not {country}.
                Check the code, or the destination this was priced for.
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
