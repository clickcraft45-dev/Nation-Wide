"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { PlaceAddressDto, PlaceSuggestionDto } from "@nationwide/shared-types";
import { Input, type InputProps } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import {
  mapsServiceAvailable,
  noteMapsFailure,
  loadGoogleMaps,
  parseAddressComponents,
  type PickedAddress,
} from "@/lib/google-maps";

interface Suggestion {
  id: string;
  text: string;
  /** Second line under the place name, when the source splits it. */
  secondary?: string;
  /** From Google in the browser: fetch the details through the JS API. */
  prediction?: google.maps.places.PlacePrediction;
  /** From the backend: either the address itself (OpenStreetMap) or a Google id to look up. */
  server?: PlaceSuggestionDto;
}

/** Suggestions from the backend, used when the browser key cannot call Places. */
async function serverSuggestions(input: string, regionKey: string): Promise<Suggestion[]> {
  const params = new URLSearchParams({ q: input });
  // The backend biases to one region; several codes means "worldwide" for it.
  if (regionKey && !regionKey.includes(",")) params.set("region", regionKey);
  const list = await apiClient.get<PlaceSuggestionDto[]>(`/places/suggest?${params.toString()}`);
  return list.map((s) => ({
    id: s.id,
    text: s.secondary ? `${s.primary}, ${s.secondary}` : s.primary,
    secondary: s.secondary,
    server: s,
  }));
}

interface AddressAutocompleteProps extends Omit<InputProps, "onChange" | "value" | "onSelect"> {
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was picked: the full address, with its coordinates. */
  onSelect: (address: PickedAddress) => void;
  /** ISO 3166-1 alpha-2 codes to keep suggestions inside, e.g. ["in"]. Omit for worldwide. */
  regionCodes?: string[];
  /**
   * Enter was pressed on text with no suggestion highlighted — i.e. "search for what I typed".
   * Worth handling: suggestions need the Places API, and without it this field would otherwise
   * do nothing at all for someone typing a place name.
   */
  onEnter?: (value: string) => void;
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
  onEnter,
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
    if (!typedRef.current || value.trim().length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next: Suggestion[] | null = null;
      if (mapsServiceAvailable("places")) {
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
          next = raw.flatMap((s) =>
            s.placePrediction
              ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text.toString(), prediction: s.placePrediction }]
              : [],
          );
        } catch (error) {
          // Refused key, Places not enabled or the script blocked: the backend answers instead.
          noteMapsFailure("places", error);
        }
      }
      if (!next || next.length === 0) {
        try {
          next = await serverSuggestions(value, regionKey);
        } catch {
          next = [];
        }
      }
      if (cancelled) return;
      setSuggestions(next);
      setActive(-1);
      setOpen(next.length > 0);
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
      if (suggestion.server) {
        const address =
          suggestion.server.address ??
          (await apiClient.get<PlaceAddressDto>(`/places/${encodeURIComponent(suggestion.server.id)}`));
        onSelect(address);
        return;
      }
      if (!suggestion.prediction) throw new Error("No place to look up");
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
    } catch (error) {
      if (suggestion.prediction) noteMapsFailure("places", error);
      // The details lookup failed: keep at least the address text they chose.
      onChange(suggestion.text);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Always swallowed: this field sits inside forms with a submit button, and Enter in a
      // search box must never book the shipment.
      e.preventDefault();
      if (open && active >= 0) {
        void choose(suggestions[active]);
      } else {
        onEnter?.(value);
      }
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
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
              {suggestion.server ? (
                <span className="min-w-0">
                  <span className="block font-medium">{suggestion.server.primary}</span>
                  {suggestion.secondary && (
                    <span className="block text-xs text-muted-foreground">{suggestion.secondary}</span>
                  )}
                </span>
              ) : (
                <span>{suggestion.text}</span>
              )}
            </li>
          ))}
          {/* Google's terms and the OpenStreetMap licence both require attribution on the list. */}
          <li role="presentation" className="px-3 py-1.5 text-right text-[10px] text-muted-foreground">
            {suggestions.some((s) => s.server?.source === "osm")
              ? "Search by OpenStreetMap contributors"
              : "Powered by Google"}
          </li>
        </ul>
      )}
    </div>
  );
}
