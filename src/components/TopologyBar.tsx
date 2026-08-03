import { useState } from "react";
import { useHub } from "../state/hub";
import { PRESETS, PRESET_IDS, callCount } from "../agents/topology";

// The launcher for a harness shape, sitting over the room it runs in.
//
// Two things this strip must show BEFORE anything is spent: which shape is
// selected (its blurb says what that shape does) and what it costs in model
// calls. A fan-out of four agents is five calls, not one — that number belongs
// next to the button, not on a bill afterwards. The default is `loop`, the
// shape the room already had: fan-out is offered as a choice, never assumed.

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
  const run = useHub((s) => s.topologyRun);
  const brainConnected = useHub((s) => s.brainConnected);
  const runTopology = useHub((s) => s.runTopology);
  const [presetId, setPresetId] = useState("loop");
  const [task, setTask] = useState("");

  const topology = PRESETS[presetId](participants);
  const calls = callCount(topology);
  const running = run !== null;
  const mine = run?.projectId === projectId;
  const canLaunch = !running && calls > 0 && task.trim().length > 0;

  // The task SURVIVES the launch, unlike a chat composer. Running one task
  // through two shapes and comparing is the whole point of having shapes at
  // all; clearing the field would tax exactly the comparison this is for.
  const launch = () => {
    if (!canLaunch) return;
    void runTopology(projectId, presetId, task);
  };

  return (
    <div className="glass flex flex-none flex-col gap-2 rounded-2xl px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="mono flex-none text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">topology</span>
        <div className="flex flex-none overflow-hidden rounded-md border border-white/10">
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setPresetId(id)}
              aria-pressed={presetId === id}
              className={`mono cursor-pointer px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
                presetId === id ? "bg-teal-400/15 text-teal-200" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {LABELS[id]}
            </button>
          ))}
        </div>
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
        {/* The price, before you pay it. */}
        <span className="mono flex-none rounded border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
          {calls} model call{calls === 1 ? "" : "s"}
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
      ) : (
        !brainConnected && (
          <div className="mono text-[10px] text-amber-300/80">
            needs a live brain — a shape runs real model calls, so it stays dark without a key
          </div>
        )
      )}
    </div>
  );
}
