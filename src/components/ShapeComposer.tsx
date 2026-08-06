import { useEffect, useMemo, useState } from "react";
import ShapePad from "./ShapePad";
import {
  MAX_AGENTS_PER_STAGE,
  MAX_STAGES,
  PRESET_IDS,
  callCount,
  plan,
  type NodeRole,
  type Stage,
  type StageKind,
} from "../agents/topology";
import {
  deleteShape,
  listShapes,
  saveShape,
  toTopology,
  validateShape,
  type CustomShape,
} from "../agents/customShapes";

// Drawing a shape, before it costs anything.
//
// The four presets are stage lists; so is anything composed here. That is what
// lets this panel be honest about price without inventing a price rule: the
// number under the stages is callCount() over the same Topology the runner will
// plan, so it is the run's FLOOR — one call per node, and nodes keep their
// tools, so a node that reads the repo takes more turns than one. It is shown
// as "N+" for exactly that reason. A hand-rolled "1 + workers + 1" would drift
// the first time a stage was left empty, and a bare "N" would be a precise lie.
//
// Everything derived — the price, the per-stage call counts, which stage is
// ROUND 2 — is read off plan(), never counted locally. The engine already
// decides that a solo stage speaks one agent and an empty stage is skipped;
// re-deciding it here is how a composer starts lying about the run.

export interface ComposerAgent {
  id: string;
  name: string;
  color: string;
  glyph: string;
}

// The operator's words for the four stage kinds. "sequence" is the engine's
// word and means nothing at a glance; IN-ORDER says what you get.
const KIND_LABEL: Record<StageKind, string> = {
  solo: "SINGLE",
  fanout: "FAN-OUT",
  sequence: "IN-ORDER",
  handoff: "HAND-OFF",
};
const KINDS: StageKind[] = ["solo", "fanout", "sequence", "handoff"];
const ROLES: NodeRole[] = ["manager", "worker", "judge"];

// IN-ORDER and HAND-OFF are the same agents in the same order for the same
// price — the ONLY difference is what each one is shown, and that difference is
// the entire reason both exist. Two labels that read alike with no way to tell
// them apart is what the preset row already did wrong once, so each kind states
// its own visibility rule in a single clause. They are deliberately parallel
// sentences: "the whole conversation" against "only the one before it" is a
// comparison you can make at a glance, which "each agent sees the last" and
// "each agent works on the previous output" — the old wording — was not.
const KIND_TITLE: Record<StageKind, string> = {
  solo: "One agent speaks — a manager splitting the task, or a judge deciding.",
  fanout: "Every agent answers at once, and none of them sees another's answer.",
  sequence: "Every agent in order, and each one sees the whole conversation so far.",
  handoff: "Every agent in order, and each one sees only the output of the one before it.",
};

// A stage that speaks more than once is speaking about its role in the plural.
const roleLabel = (role: NodeRole, kind: StageKind) => (kind === "solo" ? role : `${role}s`);

/** localStorage key and launcher id in one: the name IS the identity, so saving
 *  the same name twice updates the shape in place rather than forking it. */
const slug = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Said in one place because it is said in two: the disabled tooltip and the
 *  problems list, which must not disagree about why nothing can be added. */
const EMPTY_ROOM = "Nobody is in this room — summon an agent before a shape can name one.";

/** What the price chip means, in the operator's words. The tools are the point
 *  of a worker, so a node can legitimately take more than its one turn. */
export const PRICE_TITLE =
  "A floor, not a quote: one call per node, plus one more each time a node reads the repo — up to four calls per node.";

const SELECT =
  "mono min-w-0 cursor-pointer rounded border border-white/10 bg-[#0b1120] px-1 py-0.5 text-[9.5px] text-slate-300 outline-none focus:border-teal-300/50";
const MICRO = "mono cursor-pointer rounded border border-white/10 px-1.5 py-0.5 text-[9.5px] text-slate-500 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30";

export default function ShapeComposer({
  roster,
  initial,
  onClose,
  onSaved,
}: {
  /** Exactly who is in this room — the composer cannot offer anyone else, and
   *  validateShape is given the same list, so the dropdowns and the gate agree. */
  roster: ComposerAgent[];
  /** The shape being edited, or null for a new one. */
  initial: CustomShape | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.label ?? "");
  const [view, setView] = useState<"pad" | "form" | "json">("pad");
  const [padSel, setPadSel] = useState<import("./ShapePad").PadSelection | null>(null);
  // Held only while the field is focused, so a half-typed brace does not fight
  // the parsed value the pad is already showing.
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>(
    () => initial?.stages.map((s) => ({ ...s, agentIds: [...s.agentIds] })) ?? [firstStage(roster)]
  );

  const id = slug(name);
  const draft: CustomShape = useMemo(
    () => ({ id: id || "draft", label: name.trim() || "untitled", stages }),
    [id, name, stages]
  );
  const topology = useMemo(() => toTopology(draft), [draft]);

  // THE PRICE FLOOR. Recomputed on every edit from the real planner, so it
  // moves as the shape is drawn. It counts NODES, and a node holding tools can
  // take up to four turns, so the run can spend more than this — never less.
  // Hence "N+": an honest range, rather than a number that reads as a promise.
  const calls = callCount(topology);

  // Read once, when the panel opens, rather than on every keystroke: this is
  // the only thing here that touches localStorage, nothing else writes saved
  // shapes while the panel is up, and the read parses the whole store.
  const [existing] = useState(listShapes);

  // Per-stage truth, read off the plan rather than counted here: how many calls
  // this stage costs, and which pass of the shape it is. A second FAN-OUT of
  // workers is ROUND 2, and the engine tells its agents so — showing it here is
  // the only way an operator can see that before paying for it.
  const perStage = useMemo(() => {
    const phases = plan(topology);
    const out = new Map<number, { calls: number; round?: number }>();
    let k = 0;
    stages.forEach((stage, i) => {
      // expand() skips a stage with nobody in it, so it produces no phase and
      // the phase after it must not be misread as belonging to this one.
      const speaking = (stage.kind === "solo" ? stage.agentIds.slice(0, 1) : stage.agentIds).filter(Boolean);
      if (speaking.length === 0) return;
      const phase = phases[k++];
      if (!phase) return;
      const nodes = "node" in phase ? [phase.node] : phase.nodes;
      // The badge is a claim about the BRIEF, so only show it where the engine
      // actually writes a round-aware one. A closing solo MANAGER carries
      // round 2 in every ordinary fan-out — it is the merge, not a second pass —
      // and briefFor deliberately leaves its brief alone, so badging it would
      // promise a revision that never happened.
      const roundIsHonoured = !(phase.kind === "synthesize" && phase.node.role === "manager");
      out.set(i, { calls: nodes.length, round: roundIsHonoured ? nodes[0]?.round : undefined });
    });
    return out;
  }, [stages, topology]);

  // Everything worth reading before saving, and how much of it STOPS the save.
  // A name collision is a note, not a problem: replacing a shape you named on
  // purpose is legitimate. It just may never happen invisibly, which is why it
  // is a sentence here and a changed header rather than a blocked button.
  const { notes, blocking, replaces } = useMemo(() => {
    const own: string[] = [];
    if (!id) own.push("A shape needs a name.");
    // The runner looks a shape id up in saved shapes BEFORE the presets, so a
    // saved "loop" would quietly shadow the built-in one for every room.
    else if (PRESET_IDS.includes(id)) own.push(`"${id}" is a built-in shape — pick another name.`);
    if (roster.length === 0) own.push(EMPTY_ROOM);
    const problems = [...own, ...validateShape(stages, roster.map((a) => a.id))];
    // The name IS the id, so a name that slugs onto a saved shape OVERWRITES
    // it — and on the edit path the shape being renamed is deleted too, which
    // turns two saved shapes into one. An eight-stage shape is worth a sentence.
    const hit = id && id !== initial?.id ? existing.find((s) => s.id === id) : undefined;
    return {
      notes: hit ? [...problems, `A shape called "${hit.label}" already exists — saving replaces it.`] : problems,
      blocking: problems.length,
      replaces: hit ?? null,
    };
  }, [id, stages, roster, initial, existing]);

  // The composer floats over the room the way the tutorial does, and the app's
  // global Escape is a BACK-OUT — with focus on a select or a button it leaves
  // the project stage entirely, unmounting this panel and the draft in it.
  // Caught on the way down and stopped here, so Escape closes the composer and
  // nothing else. A field keeps its own Escape, exactly as it does app-wide.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const patch = (i: number, next: Partial<Stage>) =>
    setStages((s) => s.map((st, k) => (k === i ? { ...st, ...next } : st)));
  const agentsOf = (i: number) => stages[i]?.agentIds ?? [];

  const move = (i: number, d: -1 | 1) =>
    setStages((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = () => {
    if (blocking > 0) return;
    // Renaming an open shape is a RENAME, not a fork: leaving the old entry
    // behind would read as "the edit didn't take".
    if (initial && initial.id !== id) deleteShape(initial.id);
    saveShape({ id, label: name.trim(), stages });
    onSaved(id);
  };

  return (
    <div
      data-testid="shape-composer"
      className="glass panel-solid absolute top-full right-0 left-0 z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-xl p-3"
    >
      <div className="flex items-center justify-between gap-2">
        {/* The header carries the warning too: an operator who saves on reflex
            reads the title of the panel, not the list at the bottom of it. */}
        <div
          className={`mono text-[9px] tracking-[0.2em] uppercase ${replaces ? "text-amber-300/90" : "text-slate-400"}`}
        >
          {replaces ? "replace shape" : initial ? "edit shape" : "new shape"}
        </div>
        <button onClick={onClose} aria-label="Close composer" className="mono cursor-pointer text-[9px] text-slate-500 hover:text-slate-300">
          close
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="mono w-10 flex-none text-[9.5px] tracking-[0.2em] text-slate-500 uppercase">name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Shape name"
          placeholder="fable-manages-three"
          className="mono min-w-0 flex-1 rounded border border-white/10 bg-[#0b1120] px-2 py-1 text-[11px] text-slate-100 placeholder-slate-600 outline-none focus:border-teal-300/50"
        />
      </div>

      {/* THE PAD — the same stages as a graph. It is not a second source of
          truth: both surfaces edit `stages`, so whatever the picture shows is
          what the runner will execute. The form stays because the graph is bad
          at some things (renaming an agent in a long list), and the graph is
          here because the form is bad at the thing that matters — showing WHO
          READS WHOSE ANSWER. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(["pad", "form", "json"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`mono cursor-pointer rounded border px-2 py-0.5 text-[9.5px] tracking-wider uppercase transition ${
              view === v
                ? "border-teal-300/50 bg-teal-400/15 text-teal-200"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
            }`}
          >
            {v === "pad" ? "graph" : v}
          </button>
        ))}
        <span className="mono text-[9px] text-slate-500">
          {view === "pad"
            ? "click a node to inspect its step"
            : view === "json"
              ? "the shape as data — the same object the runner reads"
              : "every field, including the ones the graph hides"}
        </span>
      </div>

      {view === "pad" && (
        <div className="mt-2">
          <ShapePad
            stages={stages}
            roster={roster}
            onChange={setStages}
            selection={padSel}
            onSelect={setPadSel}
          />
        </div>
      )}

      {view === "json" && (
        <div className="mt-2">
          <textarea
            aria-label="Shape JSON"
            data-testid="shape-json"
            value={jsonDraft ?? JSON.stringify(stages, null, 2)}
            onChange={(e) => {
              setJsonDraft(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value);
                // Shape-checked before it is accepted: the pad and the runner
                // both read this, so malformed data must not reach either.
                if (
                  Array.isArray(parsed) &&
                  parsed.every(
                    (st) =>
                      st &&
                      typeof st.kind === "string" &&
                      typeof st.role === "string" &&
                      Array.isArray(st.agentIds)
                  )
                ) {
                  setStages(parsed as Stage[]);
                  setJsonErr(null);
                } else {
                  setJsonErr("Each step needs a kind, a role and an agentIds array.");
                }
              } catch {
                setJsonErr("Not valid JSON yet.");
              }
            }}
            onBlur={() => setJsonDraft(null)}
            spellCheck={false}
            rows={10}
            className="mono w-full rounded-lg border border-white/10 bg-[#0b1120] p-2 text-[10.5px] leading-relaxed text-slate-200 outline-none focus:border-teal-300/50"
          />
          <div className={`mono mt-1 text-[9px] ${jsonErr ? "text-amber-300" : "text-slate-500"}`}>
            {jsonErr ?? "edits apply live — switch to the graph to see them"}
          </div>
        </div>
      )}

      <div className={`mt-2 space-y-1.5 ${view === "form" ? "" : "hidden"}`}>
        {stages.map((stage, i) => {
          const meta = perStage.get(i);
          const agentIds = stage.agentIds;
          const full = agentIds.length >= MAX_AGENTS_PER_STAGE;
          return (
            <div key={i} data-testid={`stage-${i}`} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="mono flex-none text-[10px] text-slate-500">({i + 1})</span>
                  <select
                    aria-label={`Stage ${i + 1} kind`}
                    value={stage.kind}
                    onChange={(e) => patch(i, { kind: e.target.value as StageKind })}
                    // On the select as well as on each option: an option's own
                    // title only appears while the list is open, so the closed
                    // control would otherwise be the one place the difference
                    // between the two sequential kinds is invisible — which is
                    // the state the shape spends all of its time in.
                    title={KIND_TITLE[stage.kind]}
                    className={`${SELECT} w-[5.5rem] flex-none`}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k} title={KIND_TITLE[k]}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Stage ${i + 1} role`}
                    value={stage.role}
                    onChange={(e) => patch(i, { role: e.target.value as NodeRole })}
                    className={`${SELECT} w-[5.5rem] flex-none`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r, stage.kind)}
                      </option>
                    ))}
                  </select>
                  <span className="mono flex-none text-[10px] text-slate-600">→</span>

                  {agentIds.map((agentId, j) => (
                    <span key={j} className="flex flex-none items-center gap-0.5">
                      <select
                        aria-label={`Stage ${i + 1} agent ${j + 1}`}
                        value={agentId}
                        onChange={(e) =>
                          patch(i, { agentIds: agentIds.map((a, k) => (k === j ? e.target.value : a)) })
                        }
                        className={`${SELECT} w-[6rem]`}
                      >
                        {/* An id the room no longer holds stays visible instead of
                            snapping to someone else — validation names it below. */}
                        {!roster.some((a) => a.id === agentId) && <option value={agentId}>{agentId} ?</option>}
                        {roster.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      {agentIds.length > 1 && (
                        <button
                          onClick={() => patch(i, { agentIds: agentIds.filter((_, k) => k !== j) })}
                          aria-label={`Remove agent ${j + 1} from stage ${i + 1}`}
                          className="mono cursor-pointer px-0.5 text-[9px] text-slate-600 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}

                  {stage.kind !== "solo" && (
                    <button
                      onClick={() => patch(i, { agentIds: [...agentIds, roster[0]?.id ?? ""] })}
                      disabled={full || roster.length === 0}
                      // Reason first: a disabled button whose tooltip describes
                      // what it would do reads as broken rather than blocked.
                      title={
                        roster.length === 0
                          ? EMPTY_ROOM
                          : full
                            ? `A stage takes at most ${MAX_AGENTS_PER_STAGE} agents`
                            : "Another agent in this stage"
                      }
                      aria-label={`Add agent to stage ${i + 1}`}
                      className={MICRO}
                    >
                      + add
                    </button>
                  )}
                </div>

                <div className="flex flex-none items-center gap-1">
                  {meta?.round && meta.round > 1 && (
                    <span
                      title="This stage speaks a second time — its agents are told to build on the earlier round, not to start over."
                      className="mono rounded border border-violet-300/30 bg-violet-400/10 px-1 py-0.5 text-[8.5px] text-violet-200"
                    >
                      round {meta.round}
                    </span>
                  )}
                  <span className="mono w-9 text-right text-[9px] text-slate-600">{meta?.calls ?? 0}×</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move stage ${i + 1} up`} className={MICRO}>
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === stages.length - 1}
                    aria-label={`Move stage ${i + 1} down`}
                    className={MICRO}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setStages((s) => s.filter((_, k) => k !== i))}
                    aria-label={`Delete stage ${i + 1}`}
                    className={`${MICRO} hover:!text-rose-300`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* A HAND-OFF of one is legal, runs, and costs what it says — the
                  chain simply has nothing to hand. That is a thing worth
                  knowing and NOT a thing to be stopped, so it is said here in
                  slate rather than added to the amber problems list: everything
                  in that list blocks the save, and a hint that blocks nothing
                  must not sit among sentences that all do.

                  The count comes from plan() by way of perStage, like every
                  other derived number in this panel — counting agentIds here
                  would show the hint for a stage naming one real agent and one
                  who has left the room, which is two links short of nothing,
                  not one. */}
              {stage.kind === "handoff" && meta?.calls === 1 && (
                <div data-testid={`stage-${i}-hint`} className="mono mt-1.5 pl-6 text-[9px] text-slate-500">
                  one agent — there is nobody to hand to. Legal, but a chain of one; add a second agent for the
                  hand-off to mean anything.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setStages((s) => (s.length >= MAX_STAGES ? s : [...s, nextStage(s, roster)]))}
          disabled={stages.length >= MAX_STAGES}
          aria-label="Add stage"
          className={MICRO}
        >
          + add stage
        </button>
        {/* The cap is stated, not just enforced — a button that goes dead with no
            reason reads as a bug. */}
        <span className={`mono text-[9px] ${stages.length >= MAX_STAGES ? "text-amber-300/80" : "text-slate-600"}`}>
          {stages.length}/{MAX_STAGES} stages · {MAX_AGENTS_PER_STAGE} agents per stage
        </span>
      </div>

      {notes.length > 0 && (
        <ul data-testid="shape-problems" className="mono mt-2 space-y-0.5 text-[9.5px] text-amber-300/90">
          {notes.map((p, i) => (
            <li key={i}>⚠ {p}</li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <span
          role="status"
          data-testid="composer-calls"
          title={calls === 0 ? "Nothing in this shape can speak yet." : PRICE_TITLE}
          className={`mono rounded border px-2 py-0.5 text-[10px] ${
            calls === 0 ? "border-white/10 bg-white/5 text-slate-400" : "border-amber-300/30 bg-amber-400/10 text-amber-200"
          }`}
        >
          {calls === 0 ? "nothing to run" : `${calls}+ model calls`}
        </span>
        <button
          onClick={save}
          disabled={blocking > 0}
          aria-label="Save shape"
          className={`mono rounded-lg border px-2.5 py-1 text-[11px] transition ${
            blocking === 0
              ? "cursor-pointer border-teal-300/50 bg-teal-400/15 text-teal-200 hover:bg-teal-400/30"
              : "cursor-not-allowed border-white/10 bg-white/5 text-slate-600"
          }`}
        >
          save
        </button>
      </div>
    </div>
  );
}

/** A new shape opens on the first thing every shape needs: one agent, speaking. */
const firstStage = (roster: ComposerAgent[]): Stage => ({
  kind: "solo",
  role: "manager",
  agentIds: roster[0] ? [roster[0].id] : [],
});

/**
 * "+ add stage" proposes the next stage of the shape being drawn rather than a
 * blank one — a manager is followed by workers, workers by a judge. It is only
 * a default; every field is still a dropdown.
 */
function nextStage(stages: Stage[], roster: ComposerAgent[]): Stage {
  const last = stages[stages.length - 1];
  const ids = roster.map((a) => a.id);
  if (!last) return firstStage(roster);
  if (last.kind === "solo" && last.role === "manager") {
    // Workers default to whoever the manager is not, so a fresh fan-out is not
    // three copies of the same agent.
    const others = ids.filter((a) => a !== last.agentIds[0]);
    return { kind: "fanout", role: "worker", agentIds: (others.length > 0 ? others : ids).slice(0, 3) };
  }
  if (last.role === "worker") return { kind: "solo", role: "judge", agentIds: ids.slice(-1) };
  return { kind: "fanout", role: "worker", agentIds: ids.slice(0, 2) };
}
