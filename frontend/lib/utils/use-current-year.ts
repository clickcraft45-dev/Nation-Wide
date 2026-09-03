import { useEffect, useState } from "react";

// Statically-generated pages bake in whatever year it was at build time. Computing
// new Date().getFullYear() directly during render would either keep showing that stale build
// year forever, or mismatch hydration if the client's first render runs in a later year than the
// server's did. Starting from `null` keeps the server and client's first render identical (no
// year shown), then fills in the real current year once mounted in the browser.
export function useCurrentYear(): number | null {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    // One-shot correction after mount, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(new Date().getFullYear());
  }, []);

  return year;
}
