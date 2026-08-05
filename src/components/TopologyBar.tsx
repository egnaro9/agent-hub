import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHub } from "../state/hub";
import { PRESETS, PRESET_IDS, callCount } from "../agents/topology";
import { deleteShape, listShapes, toTopology, validateShape, type CustomShape } from "../agents/customShapes";
import ShapeComposer, { PRICE_TITLE, type ComposerAgent } from "./ShapeComposer";

// The launcher for a harness shape, sitting over the room it runs in.
//
// Two things this strip must show BEFORE anything is spent: which shape is
// selected (its blurb says what that shape does) and what it costs in model
// calls. A fan-out of four agents is at least five calls, not one — that
// number belongs next to the button, not on a bill afterwards. It is a FLOOR
// and reads "N+": the nodes keep their tools, so one that reads the repo takes
// more than its one turn, and an honest range beats a precise lie. The default
// is `loop`, the shape the room already had: fan-out is a choice, never assumed.
//
// The row also holds the operator's own shapes. They are not a second kind of
// thing — a saved shape is stages, same as a preset — so selecting one changes
// nothing here but where the Topology came from, and the price is the same
// callCount() over the same planner.

const NO_ONE: string[] = [];

// Labels are a property of the shape, not of this component — read them off the
// presets so a renamed shape renames its own chip.
const LABELS: Record<string, string> = Object.fromEntries(
  PRESET_IDS.map((id) => [id, PRESETS[id](NO_ONE).label])
);

export default function TopologyBar({ projectId }: { projectId: string }) {
  // Module-level constant fallback: a fresh array here would be a new reference
  // on every store update and re-render this strip forever.
  const participants = useHub((s) => s.channels[projectId]?.participants ?? NO_ONE);
  const agents = useHub((s) => s.agents);
  const run = useHub((s) => s.topologyRun);
  const brainConnected = useHub((s) => s.brainConnected);
  const runTopology = useHub((s) => s.runTopology);
  const lastRunExport = useHub((s) => s.lastRunExport);
  const [shapeId, setShapeId] = useState("loop");
  const [task, setTask] = useState("");
  // localStorage is read once and re-read on every save or delete, not on every
  // render: this strip re-renders on each streamed token of a run.
  const [saved, setSaved] = useState(() => listShapes());
  // null = closed; {initial: null} = a new shape; {initial: shape} = editing one.
  const [composing, setComposing] = useState<{ initial: CustomShape | null } | null>(null);

  const selected = saved.find((s) => s.id === shapeId) ?? null;
  // A preset is rebuilt from whoever is in the room; a saved shape names its own
  // agents. Either way what comes out is a Topology, and nothing below this line
  // knows which it got.
  const topology = selected ? toTopology(selected) : (PRESETS[shapeId] ?? PRESETS.loop)(participants);
  const calls = callCount(topology);

  // The same gate the runner applies, applied here so the price chip cannot
  // quote a shape that will be refused: a saved shape survives the room it was
  // composed in, and an agent who has left must be named before launch, not
  // after. Presets are exempt for the same reason the runner exempts them —
  // they are built from the current room by construction.
  const blocked = selected ? validateShape(selected.stages, participants) : [];

  const roster: ComposerAgent[] = useMemo(
    () =>
      participants.map((id) => {
        const a = agents.find((x) => x.id === id);
        // The room's participant list is the truth about who can be named, so an
        // id with no roster entry is still offered rather than silently dropped.
        return a ? { id, name: a.name, color: a.color, glyph: a.glyph } : { id, name: id, color: "#64748b", glyph: "?" };
      }),
    [participants, agents]
  );

  const running = run !== null;
  const mine = run?.projectId === projectId;
  const canLaunch = !running && calls > 0 && blocked.length === 0 && task.trim().length > 0;

  // The task SURVIVES the launch, unlike a chat composer. Running one task
  // through two shapes and comparing is the whole point of having shapes at
  // all; clearing the field would tax exactly the comparison this is for.
  const launch = () => {
    if (!canLaunch) return;
    // Hand over the number the chip is showing. Without it the runner's
    // quote check is dead code: `quoted` stays undefined and a shape edited
    // in another tab is priced here and run there at a different size.
    void runTopology(projectId, shapeId, task, calls);
  };

  const remove = (id: string) => {
    deleteShape(id);
    setSaved(listShapes());
    // Falling back to `loop` rather than to nothing: a launcher pointing at a
    // shape that no longer exists is a run that refuses at the click.
    if (shapeId === id) setShapeId("loop");
    setComposing(null);
  };

  // `delete` sits a few pixels from `edit` at 9.5px, and a saved shape has no
  // undo — so the first click only ARMS it and says so. It disarms itself
  // rather than staying armed: an arm left over from a mis-click minutes ago
  // must not be completed by the next click that lands there.
  const [armed, setArmed] = useState<string | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (disarm.current) clearTimeout(disarm.current);
    };
  }, []);
  const askRemove = (id: string) => {
    if (disarm.current) clearTimeout(disarm.current);
    if (armed === id) {
      setArmed(null);
      remove(id);
      return;
    }
    setArmed(id);
    disarm.current = setTimeout(() => setArmed(null), 4000);
  };

  // Stable across renders so the composer's Escape listener is not torn down
  // and re-added on every streamed token of a run.
  const closeComposer = useCallback(() => setComposing(null), []);

  const chip = (id: string, label: string) => (
    <button
      key={id}
      onClick={() => setShapeId(id)}
      aria-pressed={shapeId === id}
      className={`mono cursor-pointer px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
        shapeId === id ? "bg-teal-400/15 text-teal-200" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    // The composer hangs BELOW this strip, over the room. `.glass` sets
    // backdrop-filter, which opens a stacking context — so the panel's own
    // z-index is trapped inside this strip and the room, a later sibling,
    // paints over it (measured: the room's empty-state div swallowed the
    // clicks). Raising the strip itself is the fix, and only while the panel
    // is open: z-10 clears the room and still sits under the HUD's z-20, so
    // the header's own popovers keep winning.
    <div
      className={`glass relative flex flex-none flex-col gap-2 rounded-2xl px-3.5 py-2.5 ${composing ? "z-10" : ""}`}
    >
      {/* Phone: the chip row scrolls sideways INSIDE this strip instead of
          wrapping into a tower — the page itself must never scroll
          horizontally. sm+ keeps today's wrap. */}
      <div className="flex items-center gap-x-3 gap-y-1.5 overflow-x-auto sm:flex-wrap sm:overflow-x-visible">
        <span className="mono flex-none text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">topology</span>
        <div className="flex flex-none overflow-hidden rounded-md border border-white/10">
          {PRESET_IDS.map((id) => chip(id, LABELS[id]))}
          {/* Composed shapes sit in the same group as the presets, because they
              are the same thing and pick the same way. */}
          {saved.map((s) => chip(s.id, s.label))}
        </div>
        <button
          onClick={() => setComposing({ initial: null })}
          className="mono flex-none cursor-pointer rounded-md border border-dashed border-white/15 px-2 py-1 text-[10px] tracking-wider text-slate-500 uppercase transition hover:border-teal-300/40 hover:text-teal-200"
        >
          + new shape
        </button>
        {selected && (
          <span className="flex flex-none items-center gap-2">
            <button
              onClick={() => setComposing({ initial: selected })}
              aria-label="Edit shape"
              className="mono cursor-pointer text-[9.5px] text-slate-500 hover:text-slate-200"
            >
              edit
            </button>
            <button
              onClick={() => askRemove(selected.id)}
              aria-label={armed === selected.id ? "Confirm delete shape" : "Delete shape"}
              title={armed === selected.id ? "Click again to delete it — there is no undo." : undefined}
              className={`mono cursor-pointer text-[9.5px] ${
                armed === selected.id ? "text-rose-300" : "text-slate-500 hover:text-rose-300"
              }`}
            >
              {armed === selected.id ? "delete?" : "delete"}
            </button>
          </span>
        )}
        <span className="mono min-w-0 flex-1 truncate text-[10.5px] text-slate-500">{topology.blurb}</span>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 focus-within:border-teal-300/50">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && launch()}
          aria-label="Topology task"
          placeholder={`Task for the shape — ${participants.length} in the room`}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-slate-100 placeholder-slate-500 outline-none"
        />
        {/* The floor of the price, before you pay it. Zero is not a price —
            it means the room cannot fill this shape — so it says that instead
            of the nonsense "0+". */}
        <span
          title={calls === 0 ? "This shape has no one to run it in this room." : PRICE_TITLE}
          className={`mono flex-none rounded border px-2 py-0.5 text-[10px] ${
            calls === 0
              ? "border-white/10 bg-white/5 text-slate-400"
              : "border-amber-300/30 bg-amber-400/10 text-amber-200"
          }`}
        >
          {calls === 0 ? "nothing to run" : `${calls}+ model calls`}
        </span>
        <button
          onClick={launch}
          disabled={!canLaunch}
          aria-label="Launch topology"
          className={`mono flex-none rounded-lg border px-2.5 py-1 text-[11px] transition ${
            canLaunch
              ? "cursor-pointer border-teal-300/50 bg-teal-400/15 text-teal-200 hover:bg-teal-400/30"
              : "cursor-not-allowed border-white/10 bg-white/5 text-slate-600"
          }`}
        >
          {running ? "running…" : "run ▸"}
        </button>
      </div>

      {blocked.length > 0 && (
        <div className="mono text-[10px] text-amber-300/80">⚠ {blocked.join(" ")} Edit the shape, or summon them back.</div>
      )}

      {running ? (
        <div className="mono flex items-center gap-2 text-[10px] text-teal-200">
          <span className="breathe inline-block h-1.5 w-1.5 flex-none rounded-full bg-teal-300" />
          {mine ? (
            <span>
              phase {run!.step}/{run!.steps} · {run!.label}
            </span>
          ) : (
            <span className="text-slate-500">a shape is already running in another room</span>
          )}
        </div>
      ) : lastRunExport?.project === projectId ? (
        // The gradable artifact, offered while it's warm. In memory only — a
        // reload forgets it (the journal keeps the numbers; the FILE is for
        // grading scripts, and it downloads exactly what this room showed).
        <button
          data-testid="export-run"
          onClick={() => void import("../state/runExport").then((m) => m.downloadRunExport(lastRunExport))}
          className="mono cursor-pointer self-start text-[10px] text-cyan-300/80 transition hover:text-cyan-200"
          title="Download the last run — transcript, node records, exact spend, pinned config — as one JSON file"
        >
          ⇣ export last run · {lastRunExport.shape.label} · spent {lastRunExport.spent}
        </button>
      ) : (
        !brainConnected && (
          <div className="mono text-[10px] text-amber-300/80">
            needs a live brain — a shape runs real model calls, so it stays dark without a key
          </div>
        )
      )}

      {composing && (
        <ShapeComposer
          // Remounts on switching between a new shape and editing one, so the
          // draft in the panel is never last shape's state.
          key={composing.initial?.id ?? "new"}
          roster={roster}
          initial={composing.initial}
          onClose={closeComposer}
          onSaved={(id) => {
            setSaved(listShapes());
            setShapeId(id);
            setComposing(null);
          }}
        />
      )}
    </div>
  );
}
