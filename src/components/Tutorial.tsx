import { useEffect, useRef, useState } from "react";
import { useHub } from "../state/hub";
import { SECTIONS } from "./tutorial/entries";

// The manual, in the app, organised by what you are trying to do rather than by
// which menu the control happens to live in.
//
// It owns its own button so the edit to MissionControl stays one element: all
// of the open/close/first-run logic is here, next to the copy it governs.
//
// The copy itself is in tutorial/entries.ts and is checked against source. The
// rule that earned its own paragraph there: anything inert without an API key
// says so, because "I stored a Groq key and the agents are still canned" is the
// single most common way this app confuses someone.

const SEEN_KEY = "agent-hub:seen-tutorial";

const seen = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    // Private mode: we cannot remember having shown it, so we never show it.
    // Nagging on every load would be worse than never introducing ourselves.
    return true;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — nothing to remember it with */
  }
};

/** A deep link is a deliberate destination. Don't open a panel over it. */
const arrivedByDeepLink = () => /^#\/p\//.test(location.hash);

export default function Tutorial() {
  const stage = useHub((s) => s.stage);

  // Decided once per mount, in a ref rather than in the useState initializer:
  // StrictMode double-invokes both, and the ref is what keeps "is this the
  // first run" a single answer across the pair.
  const firstRun = useRef<boolean | null>(null);
  if (firstRun.current === null) firstRun.current = !seen() && !arrivedByDeepLink();

  const [open, setOpen] = useState(firstRun.current);
  // The first-run wording ("this opens once…") belongs to the automatic
  // showing. Once you have opened it yourself, you plainly know how, and
  // repeating it would be the second nag we promised not to make.
  const [introducing, setIntroducing] = useState(firstRun.current);
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const rootRef = useRef<HTMLDivElement>(null);

  // Seen is written the moment it SHOWS, not when it is dismissed. Someone who
  // closes the tab without clicking anything has still been offered it once,
  // and being asked twice is the thing we promised not to do.
  useEffect(() => {
    if (firstRun.current) markSeen();
  }, []);

  // Navigating away should never leave this floating over the new stage — same
  // rule the other top-bar menus follow. Compared by identity rather than with
  // a "first run" flag: StrictMode re-runs this effect on mount with the very
  // same stage object, and a flag would read that re-run as a navigation and
  // close the first-run showing before anyone saw it.
  const lastStage = useRef(stage);
  useEffect(() => {
    if (lastStage.current === stage) return;
    lastStage.current = stage;
    setOpen(false);
  }, [stage]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Typing? Escape belongs to the field, exactly as it does app-wide.
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      // The app's global Escape is a back-out — close the DM, clear the tray,
      // leave the stage. With this open, Escape means "close this" and nothing
      // else, so it is caught on the way down and stops here.
      e.stopPropagation();
      setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      // rootRef wraps the button too, so clicking `?` to close doesn't get
      // dismissed here and immediately re-opened by the button's own onClick.
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    // Capture, not bubble: d3-drag (under React Flow) calls
    // stopImmediatePropagation on the pane's mousedown, so a bubble-phase
    // listener on document never hears a click on the constellation — which is
    // the one backdrop this panel most often floats over.
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [open]);

  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];

  return (
    // Deliberately NOT `relative`: the panel below anchors to the top bar, not
    // to this button. The bar wraps on a narrow window, and on a project stage
    // it wraps at 1280px — which sent a button-anchored panel to the left edge
    // and half of it off-screen.
    <div ref={rootRef}>
      <button
        data-testid="tutorial-button"
        onClick={() => {
          setIntroducing(false);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label="How this hub works"
        title="How this hub works"
        className={`mono cursor-pointer rounded-md border px-2.5 py-1 text-[10px] transition ${
          open
            ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200"
            : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
        }`}
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="How this hub works"
          data-testid="tutorial-panel"
          // panel-solid, not glass alone: this floats over the constellation,
          // and backdrop-filter does not sample across React Flow's transformed
          // stacking contexts — the graph shows through, unblurred, behind text.
          //
          // Anchored to the top bar (the nearest positioned ancestor), so
          // `top-full` means "under the bar" whether the bar is one row or two,
          // and `right-4` lines up with the bar's own padding.
          //
          // The height is measured off the viewport rather than fixed, because
          // the camera cluster lives at the bottom right of the same corner this
          // panel grows into: a tall panel on a short screen covers the lock.
          className="glass panel-solid absolute top-full right-4 z-40 mt-1 flex max-h-[calc(100vh-11rem)] w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">how this hub works</div>
            <span className="mono text-[9px] text-slate-600">{SECTIONS.length} areas</span>
          </div>

          {introducing && (
            <p className="mt-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/8 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-300">
              This opens once, on your first visit. Close it whenever you like —{" "}
              <span className="text-cyan-200">?</span> in the top bar brings it back.
            </p>
          )}

          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            Written from the code, not the roadmap. Where something does nothing without an API key, it says so.
          </p>

          {/* areas, not menus — you arrive here knowing what you want to do */}
          <div className="mt-2.5 flex flex-wrap gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSectionId(s.id)}
                aria-pressed={s.id === sectionId}
                className={`mono cursor-pointer rounded-md border px-2 py-1 text-[9.5px] transition ${
                  s.id === sectionId
                    ? "border-teal-300/40 bg-teal-400/15 text-teal-200"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <p className="mono mt-2 text-[9.5px] leading-relaxed text-slate-500">{section.blurb}</p>

          {/* No area fits above the fold; the nav and the dismiss stay put and
              only the entries scroll. `key` on the section so switching areas
              returns you to the top rather than to the old scroll offset. */}
          <div
            key={section.id}
            data-testid="tutorial-body"
            className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
          >
            {section.entries.map((e) => (
              <div key={e.title} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[10.5px] text-slate-100">{e.title}</span>
                  {e.needsKey && (
                    <span className="mono rounded border border-amber-300/30 bg-amber-400/10 px-1 py-px text-[8.5px] tracking-wider text-amber-200 uppercase">
                      needs a live brain
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-300">{e.what}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
                  <span className="mono text-[9px] tracking-[0.18em] text-slate-500 uppercase">do</span>{" "}
                  {e.how}
                </p>
                {e.gotcha && (
                  <p className="mt-1 text-[10.5px] leading-relaxed text-amber-200/75">
                    <span className="mono text-[9px] tracking-[0.18em] text-amber-300/60 uppercase">gotcha</span>{" "}
                    {e.gotcha}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => setOpen(false)}
            className="mono mt-2.5 w-full flex-none cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-300 transition hover:bg-white/10"
          >
            {introducing ? "got it — close" : "done"}
          </button>
        </div>
      )}
    </div>
  );
}
