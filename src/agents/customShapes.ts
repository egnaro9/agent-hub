// Shapes the operator composed, by name.
//
// topology.ts stopped caring which shape it is running the moment a shape
// became a list of stages, so a saved shape here is not a new kind of thing —
// it is the same data the four presets are made of, kept in localStorage
// instead of in code. That is the whole point of this file: no second runner,
// no second price rule, no second brief.
//
// validateShape() is the gate. It is pure, it takes the roster rather than
// reading one, and both the composer and the runner call it — so a shape that
// names an agent who is not in the room fails at the composer instead of at the
// third model call.

import {
  MAX_AGENTS_PER_STAGE,
  MAX_STAGES,
  PRESET_IDS,
  nodesFrom,
  type Stage,
  type StageKind,
  type Topology,
} from "./topology";

export interface CustomShape {
  id: string;
  label: string;
  stages: Stage[];
}

const KEY = "agent-hub:custom-shapes";

const BUILT_IN = new Set(PRESET_IDS);

// A RUNTIME allowlist, and TypeScript cannot police it: an array holding a
// subset of a union still typechecks, so leaving "handoff" out here compiled
// cleanly while silently discarding every composed hand-off shape on save.
// Anything added to StageKind must be added here too.
const KINDS: StageKind[] = ["solo", "fanout", "sequence", "handoff"];
const ROLES = ["manager", "worker", "judge"];

const isStage = (v: unknown): v is Stage => {
  const s = v as Partial<Stage> | null;
  return (
    !!s &&
    typeof s === "object" &&
    KINDS.includes(s.kind as StageKind) &&
    ROLES.includes(s.role as string) &&
    Array.isArray(s.agentIds) &&
    s.agentIds.every((a) => typeof a === "string")
  );
};

/**
 * A stored entry is taken whole or not at all. Dropping one bad stage out of a
 * five-stage shape would leave something that still prices and still runs, just
 * not the shape the operator saved — quieter and worse than the shape vanishing.
 */
const sanitize = (id: string, v: unknown): CustomShape | null => {
  const s = v as Partial<CustomShape> | null;
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  if (!Array.isArray(s.stages) || s.stages.length === 0) return null;
  if (!s.stages.every(isStage)) return null;
  return {
    id,
    label: typeof s.label === "string" && s.label ? s.label : id,
    stages: s.stages.map((st) => ({ kind: st.kind, role: st.role, agentIds: [...st.agentIds] })),
  };
};

const read = (): Record<string, CustomShape> => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Shape-check: a hand-edited or half-written value must not crash the app.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, CustomShape> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      // A stored id that collides with a built-in is dropped, not merged. The
      // composer refuses the name on the way in, but storage is hand-editable
      // and outlives any one build's preset list — and a surviving "loop" would
      // shadow the built-in in every room and render two chips on one React key.
      // Same discipline as sanitize(): drop the bad entry, keep the app up.
      if (BUILT_IN.has(id)) continue;
      const shape = sanitize(id, v);
      if (shape) out[id] = shape;
    }
    return out;
  } catch {
    return {};
  }
};

const write = (all: Record<string, CustomShape>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode — saved shapes just don't persist */
  }
};

/** Saved shapes, in the order they were saved. */
export const listShapes = (): CustomShape[] => Object.values(read());

export const getShape = (id: string): CustomShape | null => read()[id] ?? null;

export const saveShape = (shape: CustomShape) => {
  const clean = sanitize(shape.id, shape);
  // A shape with no usable stages is not a draft worth keeping — it would read
  // back as nothing anyway.
  if (!shape.id || !clean) return;
  write({ ...read(), [shape.id]: clean });
};

export const deleteShape = (id: string) => {
  const all = read();
  delete all[id];
  write(all);
};

/**
 * Everything wrong with a shape, in words an operator can act on. Empty list
 * means runnable. Pure on purpose: the composer calls it while you type and the
 * runner calls it again before it spends anything, and neither can drift.
 *
 * `knownAgentIds` is passed in rather than read from the roster so this stays
 * pure — and so it fails CLOSED: a caller with no roster passes an empty list
 * and every agent reads as unknown, which refuses the run instead of guessing.
 */
export function validateShape(stages: Stage[], knownAgentIds: readonly string[]): string[] {
  const problems: string[] = [];
  if (!Array.isArray(stages) || stages.length === 0) {
    problems.push("A shape needs at least one stage.");
    return problems;
  }
  if (stages.length > MAX_STAGES) {
    problems.push(`A shape can have at most ${MAX_STAGES} stages — this one has ${stages.length}.`);
  }
  const known = new Set(knownAgentIds);
  stages.forEach((stage, i) => {
    const n = i + 1;
    const agentIds = Array.isArray(stage?.agentIds) ? stage.agentIds : [];
    if (agentIds.length === 0) {
      problems.push(`Stage ${n} (${stage?.kind ?? "?"}) has no agents.`);
    }
    if (agentIds.length > MAX_AGENTS_PER_STAGE) {
      problems.push(`Stage ${n} has ${agentIds.length} agents — the cap is ${MAX_AGENTS_PER_STAGE}.`);
    }
    if (stage?.kind === "solo" && agentIds.length > 1) {
      problems.push(`Stage ${n} is a SINGLE stage but names ${agentIds.length} agents — pick one.`);
    }
    for (const id of agentIds) {
      if (!known.has(id)) problems.push(`Stage ${n} names an agent who is not in the room: "${id}".`);
    }
  });
  return problems;
}

/**
 * A saved shape as something the runner can plan and price. Node derivation
 * lives in topology.ts, so a custom shape's node list is built by the same rule
 * as a preset's — including the dedupe that a multi-round shape needs.
 */
export const toTopology = (shape: CustomShape): Topology => ({
  id: `custom:${shape.id}`,
  label: shape.label,
  blurb: `${shape.stages.length} stage${shape.stages.length === 1 ? "" : "s"}, composed.`,
  stages: shape.stages,
  nodes: nodesFrom(shape.stages),
});
