import { useEffect, useState } from "react";

// One JS breakpoint, used only where CSS alone can't do the job: the phone
// layout swaps WHICH components render (drawer vs static sidebar, overflow
// menu vs the button strip). Rendering both and hiding one with `hidden`
// would double-mount refs and ids — two #hub-search inputs, popover
// outside-click refs pointing at whichever instance rendered last — so the
// choice has to be made in JS. Guarded for jsdom, which never grew matchMedia.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mql = matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // a rotate between mount and subscribe must not be lost
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Tailwind's sm breakpoint, as a query. Below this the hub is a phone: the
// sidebar becomes a drawer and the command strip condenses. The CSS side of
// the same decision uses bare-vs-sm: prefixes — keep the two in step.
export const PHONE_QUERY = "(max-width: 639px)";
