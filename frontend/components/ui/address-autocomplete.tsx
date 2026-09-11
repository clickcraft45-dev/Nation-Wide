"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  googleMapsEnabled,
  loadGoogleMaps,
  parseAddressComponents,
  type PickedAddress,
} from "@/lib/google-maps";

interface Suggestion {
  id: string;
  text: string;
  prediction: google.maps.places.PlacePrediction;
}

export interface AddressAutocompleteProps extends Omit<InputProps, "onChange" | "value" | "onSelect"> {
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was picked: the full address, with its coordinates. */
  onSelect: (address: PickedAddress) => void;
  /** ISO 3166-1 alpha-2 codes to keep suggestions inside, e.g. ["in"]. Omit for worldwide. */
  regionCodes?: string[];
}

/**
 * An address field with Google's address search underneath.
 *
 * Built on the Places API (New) suggestion call rather than Google's drop-in widget, which new
 * API keys can no longer use and which cannot be styled to match the form.
 *
 * Never a gate: with no key, a failed load or no suggestions it is simply a text field, and the
 * customer can always type the address themselves.
 *
 * The suggestion list is rendered in the flow of the form, pushing the fields below it down,
 * rather than floating over them — so no card further down the page can ever cover it (the bug
 * the date picker had).
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  regionCodes,
  className,
  ...props
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  // Only look up what the person typed — not a value this component or its parent just set.
  const typedRef = useRef(false);
  // Keystrokes and the final details call share one session, which Google bills as one lookup.
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const listId = useId();
  const regionKey = regionCodes?.join(",") ?? "";

  useEffect(() => {
    if (!typedRef.current || !googleMapsEnabled() || value.trim().length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        await loadGoogleMaps();
        const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        sessionRef.current ??= new AutocompleteSessionToken();
        const { suggestions: raw } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: sessionRef.current,
          ...(regionKey ? { includedRegionCodes: regionKey.split(",") } : {}),
        });
        if (cancelled) return;
        const next = raw.flatMap((s) =>
          s.placePrediction
            ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text.toString(), prediction: s.placePrediction }]
            : [],
        );
        setSuggestions(next);
        setActive(-1);
        setOpen(next.length > 0);
      } catch {
        if (!cancelled) setOpen(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, regionKey]);

  async function choose(suggestion: Suggestion) {
    setOpen(false);
    typedRef.current = false;
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "location", "formattedAddress"] });
      // The details call closes the session; the next search starts a fresh one.
      sessionRef.current = null;
      const parsed = parseAddressComponents(
        (place.addressComponents ?? []).map((c) => ({
          long: c.longText ?? "",
          short: c.shortText ?? "",
          types: c.types,
        })),
        place.formattedAddress ?? suggestion.text,
      );
      onSelect({
        ...parsed,
        latitude: place.location?.lat() ?? null,
        longitude: place.location?.lng() ?? null,
      });
    } catch {
      // The details lookup failed — keep at least the address text they chose.
      onChange(suggestion.text);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Input
        {...props}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          typedRef.current = true;
          onChange(e.target.value);
          if (e.target.value.trim().length < 3) setOpen(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul id={listId} role="listbox" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: it fires before the input's blur would close the list.
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(suggestion);
              }}
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm text-foreground",
                i === active ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{suggestion.text}</span>
            </li>
          ))}
          {/* Google's terms require attribution on suggestions shown without a Google map. */}
          <li role="presentation" className="px-3 py-1.5 text-right text-[10px] text-muted-foreground">
            Powered by Google
          </li>
        </ul>
      )}
    </div>
  );
}
