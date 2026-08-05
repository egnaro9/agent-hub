import { useCallback, useSyncExternalStore } from "react";

// READABILITY-1. The console is built out of 9–11px mono labels, and the only
// way to read them was the browser's own page zoom — which shrinks the CSS
// viewport, so zooming past ~150% crossed the phone breakpoint and swapped a
// desktop operator into the hamburger layout. Legible cost you the layout.
//
// The fix is a scale the APP owns. CSS `zoom` on the app root magnifies
// everything inside it, but media queries are evaluated against the viewport,
// which element zoom does not touch — so `max-sm:` keeps answering for the real
// window and the desktop strip stays the desktop strip.

const KEY = "agent-hub:ui-scale";

/** Bounded on purpose: past ~1.3 the fixed-width panels stop fitting beside the canvas. */
export const SCALES = [1, 1.1, 1.2, 1.3] as const;
export type UiScale = (typeof SCALES)[number];

const clamp = (n: number): UiScale =>
  (SCALES.find((s) => Math.abs(s - n) < 0.001) ?? 1) as UiScale;

export const getUiScale = (): UiScale => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clamp(Number(raw)) : 1;
  } catch {
    return 1;
  }
};

const listeners = new Set<() => void>();

export const setUiScale = (s: UiScale) => {
  try {
    localStorage.setItem(KEY, String(s));
  } catch {
    /* private mode — the scale just doesn't persist */
  }
  apply(s);
  listeners.forEach((l) => l());
};

/** Written to the root element, where index.css reads it. */
export const apply = (s: UiScale) => {
  document.documentElement.style.setProperty("--ui-scale", String(s));
};

export function useUiScale(): [UiScale, (s: UiScale) => void] {
  const scale = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getUiScale,
    () => 1 as UiScale
  );
  return [scale, useCallback(setUiScale, [])];
}
