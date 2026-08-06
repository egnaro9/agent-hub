import { useMemo, useState } from "react";
import type { Stage, StageKind, NodeRole } from "../agents/topology";
import { MAX_STAGES, MAX_AGENTS_PER_STAGE } from "../agents/topology";
import type { ComposerAgent } from "./ShapeComposer";

/* ════════════════════════════════════════════════════════════════════════════
   THE SHAPE PAD — harness-builder's graph, over the hub's engine.

   Two honest constraints shape this, and neither is a limitation of the
   drawing surface:

   1. THE ENGINE RUNS STAGES, not a free graph. A stage is an ordered step; its
      agents run together (concurrently for a fan-out, in order for a sequence
      or a hand-off). So the picture is LAYERED by construction — a column per
      stage — and every edit here is a stage edit. Drawing a free DAG whose
      extra edges the runner would ignore is a prettier lie than a form.

   2. DEPTH IS 1. Workers do not spawn workers, which is what keeps the cost
      countable before anything is spent. There is no nesting to draw.

   What the graph earns over the form is the thing a form cannot show: WHO SEES
   WHOSE ANSWER. That is the whole difference between a sequence and a hand-off
   at identical price, and here it is visible as edges rather than buried in a
   dropdown.
   ═══════════════════════════════════════════════════════════════════════════ */

const COL_W = 168;
const NODE_H = 34;
const NODE_W = 128;
const ROW_GAP = 12;
const PAD_Y = 30;

const KIND_LABEL: Record<StageKind, string> = {
  solo: "solo",
  fanout: "fan-out",
  sequence: "sequence",
  handoff: "hand-off",
};

/** What each stage kind means for who reads whom — the reason to draw this. */
const KIND_BLURB: Record<StageKind, string> = {
  solo: "one agent speaks",
  fanout: "all at once · none sees another",
  sequence: "in order · each sees the whole transcript",
  handoff: "in order · each sees ONLY the one before",
};

export interface PadSelection {
  stage: number;
  agentIndex: number | null;
}

export default function ShapePad({
  stages,
  roster,
  onChange,
  selection,
  onSelect,
}: {
  stages: Stage[];
  roster: ComposerAgent[];
  onChange: (next: Stage[]) => void;
  selection: PadSelection | null;
  onSelect: (sel: PadSelection | null) => void;
}) {
  const [locked, setLocked] = useState(false);

  const byId = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const tallest = Math.max(1, ...stages.map((s) => s.agentIds.length));
  const height = PAD_Y * 2 + tallest * (NODE_H + ROW_GAP);
  const width = Math.max(COL_W * stages.length + 40, 320);

  const nodeXY = (col: number, row: number, count: number) => {
    const colH = count * (NODE_H + ROW_GAP) - ROW_GAP;
    return {
      x: 20 + col * COL_W,
      y: PAD_Y + (height - PAD_Y * 2 - colH) / 2 + row * (NODE_H + ROW_GAP),
    };
  };

  const edit = (fn: (draft: Stage[]) => void) => {
    if (locked) return;
    const next = stages.map((s) => ({ ...s, agentIds: [...s.agentIds] }));
    fn(next);
    onChange(next);
  };

  const addStage = () =>
    edit((d) => {
      if (d.length >= MAX_STAGES) return;
      d.push({ kind: "solo", role: "worker", agentIds: [] });
    });

  const dropStage = () =>
    edit((d) => {
      const at = selection?.stage ?? d.length - 1;
      if (d.length <= 1 || at < 0) return;
      d.splice(at, 1);
      onSelect(null);
    });

  const addRole = () =>
    edit((d) => {
      const at = selection?.stage ?? d.length - 1;
      const stage = d[at];
      if (!stage || stage.agentIds.length >= MAX_AGENTS_PER_STAGE) return;
      const free = roster.find((a) => !stage.agentIds.includes(a.id));
      if (free) stage.agentIds.push(free.id);
    });

  const detach = () =>
    edit((d) => {
      if (!selection || selection.agentIndex === null) return;
      d[selection.stage]?.agentIds.splice(selection.agentIndex, 1);
      onSelect({ stage: selection.stage, agentIndex: null });
    });

  // Move a node between columns — this is what "drag its right edge onto
  // another" means when the graph is layered: the agent now speaks in that step.
  const moveTo = (from: PadSelection, toStage: number) =>
    edit((d) => {
      if (from.agentIndex === null || !d[toStage]) return;
      const [id] = d[from.stage].agentIds.splice(from.agentIndex, 1);
      if (!id || d[toStage].agentIds.includes(id) || d[toStage].agentIds.length >= MAX_AGENTS_PER_STAGE) {
        if (id) d[from.stage].agentIds.splice(from.agentIndex, 0, id);
        return;
      }
      d[toStage].agentIds.push(id);
      onSelect({ stage: toStage, agentIndex: d[toStage].agentIds.length - 1 });
    });

  const tidy = () =>
    edit((d) => {
      // An empty stage costs nothing to run and everything to read — the
      // planner skips it, so it is a hole in the picture with no meaning.
      const kept = d.filter((s) => s.agentIds.length > 0);
      if (kept.length === 0) return;
      d.length = 0;
      // A stage of one is a solo whatever its kind claims: the runner speaks
      // the first agent either way, so say what will actually happen.
      kept.forEach((s) => d.push({ ...s, kind: s.agentIds.length === 1 ? "solo" : s.kind }));
      onSelect(null);
    });

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          ["+ role", addRole, "Add an agent to the selected step"],
          ["detach", detach, "Remove the selected agent from its step"],
          ["+ step", addStage, "Add a step to the end"],
          ["− step", dropStage, "Remove the selected step"],
          ["tidy", tidy, "Drop empty steps; call a one-agent step what it is"],
        ].map(([label, fn, title]) => (
          <button
            key={label as string}
            onClick={fn as () => void}
            title={title as string}
            disabled={locked}
            className={`mono rounded border px-2 py-0.5 text-[10px] transition ${
              locked
                ? "cursor-not-allowed border-white/8 bg-white/3 text-slate-600"
                : "cursor-pointer border-white/12 bg-white/5 text-slate-300 hover:border-teal-300/40 hover:text-teal-200"
            }`}
          >
            {label as string}
          </button>
        ))}
        <button
          onClick={() => setLocked((v) => !v)}
          title="Freeze the shape so a stray click cannot rewrite it"
          className={`mono cursor-pointer rounded border px-2 py-0.5 text-[10px] transition ${
            locked ? "border-amber-300/50 bg-amber-400/10 text-amber-200" : "border-white/12 bg-white/5 text-slate-400"
          }`}
        >
          {locked ? "locked" : "lock"}
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-white/8 bg-[#070b17]/60" data-testid="shape-pad">
        <svg width={width} height={height} role="img" aria-label="Shape graph">
          {/* edges: who reads whom, which is the reason this is a graph */}
          {stages.slice(0, -1).map((stage, col) => {
            const next = stages[col + 1];
            if (!next) return null;
            return stage.agentIds.map((_a, row) =>
              next.agentIds.map((_b, row2) => {
                const from = nodeXY(col, row, stage.agentIds.length);
                const to = nodeXY(col + 1, row2, next.agentIds.length);
                const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
                const x2 = to.x, y2 = to.y + NODE_H / 2;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${col}-${row}-${row2}`}
                    d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke="rgba(148,180,230,.28)"
                    strokeWidth={1}
                  />
                );
              })
            );
          })}
          {stages.map((stage, col) => (
            <g key={col}>
              <text
                x={20 + col * COL_W}
                y={16}
                className="mono"
                fill={selection?.stage === col ? "#5eead4" : "#64748b"}
                fontSize={8.5}
                letterSpacing="0.18em"
              >
                {KIND_LABEL[stage.kind].toUpperCase()}
              </text>
              {stage.agentIds.length === 0 && (
                <text x={20 + col * COL_W} y={height / 2} fill="#475569" fontSize={9} className="mono">
                  empty
                </text>
              )}
              {stage.agentIds.map((id, row) => {
                const a = byId.get(id);
                const { x, y } = nodeXY(col, row, stage.agentIds.length);
                const on = selection?.stage === col && selection?.agentIndex === row;
                return (
                  <g
                    key={`${id}-${row}`}
                    onClick={() => onSelect({ stage: col, agentIndex: row })}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={7}
                      fill={on ? "rgba(45,212,191,.14)" : "rgba(255,255,255,.04)"}
                      stroke={on ? "#5eead4" : a?.color ?? "#475569"}
                      strokeWidth={on ? 1.5 : 1}
                    />
                    <circle cx={x + 13} cy={y + NODE_H / 2} r={4} fill={a?.color ?? "#475569"} />
                    <text x={x + 24} y={y + 14} fill="#dbe6f6" fontSize={10} className="mono">
                      {a?.name ?? id}
                    </text>
                    <text x={x + 24} y={y + 25} fill="#64748b" fontSize={8} className="mono">
                      {stage.role}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* the inspector: a graph you cannot click into is a picture */}
      {selection && stages[selection.stage] && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-2.5" data-testid="pad-inspector">
          <div className="mono mb-1.5 text-[8.5px] tracking-[0.25em] text-slate-500 uppercase">
            step {selection.stage + 1} of {stages.length}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["solo", "fanout", "sequence", "handoff"] as StageKind[]).map((k) => (
              <button
                key={k}
                onClick={() => edit((d) => { d[selection.stage].kind = k; })}
                title={KIND_BLURB[k]}
                className={`mono cursor-pointer rounded border px-2 py-0.5 text-[9.5px] transition ${
                  stages[selection.stage].kind === k
                    ? "border-teal-300/50 bg-teal-400/15 text-teal-200"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            <span className="mono ml-1 text-[9px] text-slate-500">{KIND_BLURB[stages[selection.stage].kind]}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(["manager", "worker", "judge"] as NodeRole[]).map((r) => (
              <button
                key={r}
                onClick={() => edit((d) => { d[selection.stage].role = r; })}
                className={`mono cursor-pointer rounded border px-2 py-0.5 text-[9.5px] transition ${
                  stages[selection.stage].role === r
                    ? "border-white/25 bg-white/10 text-slate-100"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {selection.agentIndex !== null && stages[selection.stage].agentIds[selection.agentIndex] && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mono text-[9px] text-slate-500">move to step</span>
              {stages.map((_s, i) =>
                i === selection.stage ? null : (
                  <button
                    key={i}
                    onClick={() => moveTo(selection, i)}
                    className="mono cursor-pointer rounded border border-white/12 bg-white/5 px-1.5 py-0.5 text-[9.5px] text-slate-300 transition hover:border-teal-300/40 hover:text-teal-200"
                  >
                    {i + 1}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
