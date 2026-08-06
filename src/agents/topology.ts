// Harness shapes as data.
//
// harness-builder proved the idea on mock tasks: a harness is roles + wiring,
// so you can draw the shape and sweep it. This is the same idea with the mocks
// removed — the nodes are real agents on real models, and running a shape
// executes it in a room. The result of that sweep is also why the presets here
// are small: more scaffolding scored WORSE on a 20-task suite, so a fan-out is
// offered as a choice, never as the default.
//
// A shape is an ordered list of STAGES, and that is the only thing the runner
// reads. The four presets are not special cases in the engine — they are just
// four stage lists that happen to ship with the app, so an operator-composed
// shape runs down exactly the same path. Depth is still 1 (a stage names its
// agents; workers do not spawn workers), which is what keeps the cost countable
// before anything is spent.

export type NodeRole = "manager" | "worker" | "judge";

export type StageKind = "solo" | "fanout" | "sequence" | "handoff";

export interface Stage {
  /**
   * solo     — one agent speaks (a manager splitting, a judge deciding)
   * fanout   — every agent runs CONCURRENTLY, none sees another's answer
   * sequence — every agent in order, each seeing the last
   * handoff  — every agent in order, each seeing ONLY the one before it
   *
   * sequence and handoff run the same agents in the same order for the same
   * price. The ONLY thing that differs is what a node is shown: a sequence is a
   * conversation with the whole transcript in view, a handoff is an assembly
   * line where agent 3 never sees agent 1. Holding the agents and the task
   * fixed and varying only that is a controlled experiment — and it is the only
   * one of the two in which telephone-game drift is visible at all, because a
   * full transcript lets a late agent silently repair what an early one lost.
   */
  kind: StageKind;
  role: NodeRole;
  /** Which hub agents speak in this stage. A solo stage speaks the first one. */
  agentIds: string[];
}

/**
 * THE CEILING. callCount() quotes a FLOOR — a node that calls a tool has to
 * answer the result in another request, so the true cost is "N+". Nothing in
 * this app stopped a run that blew past it, and a shape is allowed eight
 * stages of six agents: one click could issue dozens of requests against the
 * operator's own key. The budget is the stop, and it is enforced where the
 * calls are COUNTED (the run loop), never in the button that starts them.
 */
export const DEFAULT_CALL_BUDGET = 40;
export const BUDGET_CHOICES = [10, 20, 40, 80, 0] as const; // 0 = no ceiling

/** Composer caps. Exported because customShapes.ts validates against them. */
export const MAX_STAGES = 8;
export const MAX_AGENTS_PER_STAGE = 6;

export interface TopologyNode {
  /** Stable within a topology; also the label shown in the transcript. */
  id: string;
  role: NodeRole;
  /** Which hub agent speaks this node. */
  agentId: string;
  /**
   * Which pass of the shape this node speaks in — set only from round 2 on, so
   * a single-round shape's nodes stay exactly what they were. A round-2 worker
   * is told it is building on the previous round rather than answering fresh.
   */
  round?: number;
  /**
   * Set only on the node a HAND-OFF chain STARTS at — the one with nothing
   * upstream of it, because nothing ran before it. It is positional, not a
   * property of the agent: put a manager's split ahead of the very same handoff
   * stage and its first worker IS handed something, so the flag goes off and
   * the brief stops claiming otherwise. briefFor() reads it instead of parsing
   * the node id, so the one lie the shape could tell for free — "here is what
   * you were handed" to an agent nobody handed anything — cannot come back by
   * way of an id-format change.
   */
  head?: boolean;
}

export interface Topology {
  id: string;
  label: string;
  /** One line the UI shows before you spend anything. */
  blurb: string;
  /**
   * The shape itself. Optional only so that a topology written before stages
   * existed — or one hand-built with just nodes — still runs instead of
   * throwing; plan() falls back to running whoever is present, in order.
   */
  stages?: Stage[];
  nodes: TopologyNode[];
}

export type Phase =
  | { kind: "decompose"; node: TopologyNode }
  | { kind: "fanout"; nodes: TopologyNode[] } // these run CONCURRENTLY
  | { kind: "sequence"; nodes: TopologyNode[] } // these run in order, each seeing the last
  | { kind: "handoff"; nodes: TopologyNode[] } // these run in order, each seeing ONLY the one before
  | { kind: "synthesize"; node: TopologyNode };

/**
 * Node ids are what the transcript and the phase label show ("decompose · mgr"),
 * so they are named after the job, not the index of the stage. A repeated FAN-OUT
 * or SEQUENCE carries its round, so round 2's workers are distinguishable from
 * round 1's.
 */
const nodeId = (stage: Stage, i: number, round: number): string => {
  if (stage.kind === "solo") {
    // A solo keeps one id across rounds. Fan-out's closing manager is the same
    // manager speaking again, and "mgr2" reads as a second manager who does not
    // exist — it also churns ids that are already baked into saved transcripts.
    // node.round is still set on the node, so the round badge and the
    // round-aware briefs below are unaffected.
    return stage.role === "judge" ? "judge" : stage.role === "manager" ? "mgr" : "solo";
  }
  // Hand-off gets its own letter rather than borrowing the sequence "p". The
  // round counter is per kind, so a shape holding both a sequence stage and a
  // handoff stage of workers has two round-1 stages — sharing a prefix would
  // put two different nodes in one transcript under the name "p0".
  const base = `${stage.kind === "fanout" ? "w" : stage.kind === "handoff" ? "h" : "p"}${i}`;
  return round > 1 ? `${base}r${round}` : base;
};

interface ExpandedStage {
  stage: Stage;
  round: number;
  nodes: TopologyNode[];
}

/**
 * Stages → the nodes that will actually speak. One place decides that, so the
 * plan, the price and the derived node list can never disagree about who runs.
 * A solo stage speaks exactly one agent even if a bad shape lists more, and an
 * empty stage is skipped — both keep callCount() counting exactly who speaks,
 * which is what makes it a floor worth showing.
 */
const expand = (stages: Stage[]): ExpandedStage[] => {
  const rounds = new Map<string, number>();
  const out: ExpandedStage[] = [];
  // Ids must be unique per RUN, not merely per kind-and-round. rounds is keyed
  // `kind:role`, so a handoff stage of workers and a handoff stage of judges are
  // both round 1 and both generate "h0" — and the runner finds a node's output
  // by FIRST id match, so a collision hands the next link the wrong message and
  // leaks text the hand-off exists to withhold. Solo stages are exempt on
  // purpose: fan-out's two manager stages are the same manager speaking twice
  // and deliberately share "mgr".
  const used = new Set<string>();
  for (const stage of stages) {
    const agentIds = (stage.kind === "solo" ? stage.agentIds.slice(0, 1) : stage.agentIds).filter(Boolean);
    if (agentIds.length === 0) continue;
    const key = `${stage.kind}:${stage.role}`;
    const round = (rounds.get(key) ?? 0) + 1;
    rounds.set(key, round);
    // Nothing has spoken yet only if nothing has been EMITTED yet — an empty
    // stage ahead of this one was skipped, so it hands nothing down either.
    const opensTheRun = out.length === 0;
    out.push({
      stage,
      round,
      nodes: agentIds.map((agentId, i) => {
        let id = nodeId(stage, i, round);
        if (stage.kind !== "solo") {
          while (used.has(id)) id = `${id}_${out.length}`;
          used.add(id);
        }
        return {
          id,
          role: stage.role,
          agentId,
          ...(round > 1 ? { round } : {}),
          ...(stage.kind === "handoff" && opensTheRun && i === 0 ? { head: true } : {}),
        };
      }),
    });
  }
  return out;
};

/**
 * The roster of a shape: every agent in it, once, in the order it first speaks.
 * A multi-round shape names the same agent in several stages — the room still
 * only has one of them, so the node list is deduplicated.
 */
export const nodesFrom = (stages: Stage[]): TopologyNode[] => {
  const seen = new Set<string>();
  const nodes: TopologyNode[] = [];
  for (const { nodes: staged } of expand(stages)) {
    for (const node of staged) {
      if (seen.has(node.agentId)) continue;
      seen.add(node.agentId);
      nodes.push(node);
    }
  }
  return nodes;
};

const shape = (id: string, label: string, blurb: string, stages: Stage[]): Topology => ({
  id,
  label,
  blurb,
  stages,
  nodes: nodesFrom(stages),
});

/** The shapes on offer. `loop` is what the room already did before topologies. */
export const PRESETS: Record<string, (agents: string[]) => Topology> = {
  loop: (agents) =>
    shape("loop", "loop", "Everyone speaks in turn, each seeing what came before.", [
      { kind: "sequence", role: "worker", agentIds: agents },
    ]),
  fanout: (agents) =>
    shape(
      "fanout",
      "fan-out",
      "A manager splits the task, workers answer in parallel, the manager merges.",
      // Nothing to fan out. With one agent in the room the worker stage is
      // empty, but the two solo stages would still run and still bill: "split
      // this among your workers" with no workers, then "merge the workers'
      // answers" with nothing to merge. Emitting no stages at all makes plan()
      // empty, which is what the launcher already refuses on — 0 calls quoted,
      // 0 spent, and the operator told to summon someone.
      agents.length < 2
        ? []
        : [
            { kind: "solo", role: "manager", agentIds: agents.slice(0, 1) },
            { kind: "fanout", role: "worker", agentIds: agents.slice(1) },
            { kind: "solo", role: "manager", agentIds: agents.slice(0, 1) },
          ]
    ),
  panel: (agents) =>
    shape("panel", "panel", "Independent answers from each agent, then a judge picks and says why.", [
      { kind: "fanout", role: "worker", agentIds: agents.slice(0, -1) },
      { kind: "solo", role: "judge", agentIds: agents.slice(-1) },
    ]),
  // The blurb promised a hand-off from the day the chip shipped; the stage list
  // said `sequence`, which is what `loop` already is. Two chips ran one shape,
  // and because they sat side by side they read as a comparison — worse than
  // offering three, because an operator switching between them saw the same
  // plan, the same price and the same briefs and had no way to tell that
  // nothing had changed. handoff is the shape the blurb was always describing.
  pipeline: (agents) =>
    shape("pipeline", "pipeline", "Hand-off in order: each agent works on the previous one's output.", [
      { kind: "handoff", role: "worker", agentIds: agents },
    ]),
};

export const PRESET_IDS = Object.keys(PRESETS);

/**
 * The execution plan for a topology: an ordered list of phases, read off the
 * shape's stages and nothing else — the runner has no idea which shape it is
 * holding, so a saved custom shape executes on the same path as a preset.
 * Fan-out phases are the only concurrent ones — everything else is sequential
 * so the transcript stays readable.
 */
export function plan(topology: Topology): Phase[] {
  const stages = topology.stages;
  if (!stages || stages.length === 0) {
    // No stages: an older shape, or one whose lead was dropped. Whoever is
    // present speaks in order — the runner degrades rather than throwing.
    return topology.nodes.length > 0 ? [{ kind: "sequence", nodes: topology.nodes }] : [];
  }
  const expanded = expand(stages);
  return expanded.map(({ stage, nodes }, i): Phase => {
    if (stage.kind === "solo") {
      // A solo that opens the shape is splitting the task; every later solo is
      // reading work that already exists, which is what synthesize means. That
      // makes the middle judge of a multi-round shape a synthesize, correctly.
      const opens = i === 0 && i < expanded.length - 1;
      return opens ? { kind: "decompose", node: nodes[0] } : { kind: "synthesize", node: nodes[0] };
    }
    if (stage.kind === "fanout") return { kind: "fanout", nodes };
    // Same nodes, same order, same price as a sequence — the phase kind is how
    // the runner knows to hand each node only its predecessor's output.
    if (stage.kind === "handoff") return { kind: "handoff", nodes };
    return { kind: "sequence", nodes };
  });
}

/**
 * The FLOOR of what a run costs, before spending any of it: one call per node
 * the plan will speak. The UI shows it as "N+" next to the launch button — a
 * fan-out of four is at least five calls, and that should be visible rather
 * than discovered on a bill. It is a floor and not a promise because nodes keep
 * their tools — a worker that can read the repo is the point, and reading it may
 * take more than one turn — so the run reports what it ACTUALLY spent when it
 * finishes. It counts the plan, not the shape, so an over-full solo stage or an
 * empty one cannot inflate the number: what is counted is who runs.
 */
export function callCount(topology: Topology): number {
  // Listed by the phases that speak ONCE rather than by the ones that speak per
  // node, so a phase kind added later is priced by how many nodes it names
  // instead of silently falling through to 1 and quoting a fan-out at a call.
  return plan(topology).reduce(
    (n, phase) => n + (phase.kind === "decompose" || phase.kind === "synthesize" ? 1 : phase.nodes.length),
    0
  );
}

/** What each node is told to do, by role and phase. */
export function briefFor(phase: Phase["kind"], node: TopologyNode, task: string): string {
  switch (phase) {
    case "decompose":
      return `You are the MANAGER of this run. The operator's task: "${task}". Split it into one clear sub-task per worker, addressed to them by name, in at most four lines. Do not answer the task yourself.`;
    case "fanout":
      // Round 2 exists to improve on round 1, not to re-answer it. Without this
      // the second fan-out quietly pays for three fresh first drafts. It claims
      // only the earlier ANSWERS, because nothing makes a judge run between two
      // fan-outs — fanout → fanout is a shape the composer will happily save,
      // and a brief that swears a verdict is above is wrong in exactly that one.
      return node.round && node.round > 1
        ? `You are a WORKER on this run, in ROUND ${node.round}. The previous round's answers are above, along with any verdict that was passed on them: build on that result — sharpen it, correct it, or fill a gap it left. Do not start over as if the task were fresh, and do not summarize the others.`
        : `You are a WORKER on this run. Answer only your own sub-task from the manager's split, in your own function's voice. Do not summarize the others.`;
    case "sequence":
      // The composer badges a repeated stage "round N" and tells the operator
      // its agents are told to build on the earlier round. That promise has to
      // hold for every stage kind that can repeat, not just fan-out — a badged
      // sequence handed out a byte-identical brief, so the badge was describing
      // something no node was ever told.
      return node.round && node.round > 1
        ? `Continue the work on: "${task}". This is ROUND ${node.round}: an earlier pass at this task is above. Revise and extend that work rather than restarting it, and say what you changed and why.`
        : `Continue the work on: "${task}". Build on what has already been said rather than repeating it.`;
    case "handoff":
      // Two things are true of a hand-off that are not true of a sequence, and
      // both have to be in the words or the shape is a sequence wearing a
      // different chip.
      //
      // 1. THE FIRST NODE WAS HANDED NOTHING. Every other brief in this file
      //    can talk about what is "above" because something always is. Telling
      //    the opener to work from what it received, when it received the task
      //    and nothing else, invents an upstream agent — and an agent that
      //    believes it missed context spends its turn asking for it.
      // 2. THERE IS NO BACK-CHANNEL. In a sequence an agent can leave a
      //    question for whoever speaks next, because they share a transcript
      //    and can answer it. Here the next agent sees only this output, so a
      //    question travels down the line as though it were the work — it does
      //    not come back answered, it just displaces the artifact. The output
      //    IS the deliverable, which has to be said rather than assumed.
      //
      // The task is deliberately NOT restated to the later links. Handing the
      // task back at every station returns exactly the context the shape exists
      // to withhold, and the drift this shape is built to expose stops being
      // visible the moment any agent can check the original against what it was
      // given. What a later link brings is its own function, not the goal.
      if (node.head) {
        return `You are the FIRST agent in a HAND-OFF chain, working on: "${task}". Nobody has handed you anything — the chain starts with you, so work from the task itself. What you write is passed on AS the artifact and is the only thing the next agent will see: hand over the work, not a note about the work, and do not leave a question or an open decision for whoever is next — there is no way for an answer to reach you.`;
      }
      return node.round && node.round > 1
        ? `You are a link in a HAND-OFF chain, in ROUND ${node.round}. Directly above you is ONE thing: the output of the agent immediately before you. It has already been down this chain once, so sharpen and extend what you were handed rather than starting it again. You still cannot see anything earlier in the chain and there is nobody to ask, so work with what is in front of you instead of asking for what is missing, and hand on the result AS the artifact — not a note about it, and not a question.`
        : `You are a link in a HAND-OFF chain. Directly above you is ONE thing: the output of the agent immediately before you. That is the whole of what you get — you cannot see anything earlier in the chain and there is nobody to ask, so work with what is in front of you instead of asking for what is missing. Apply your own function to it and hand on the result AS the artifact — not a note about what you would do to it, and not a question.`;
    case "synthesize":
      // Same promise, and a judge is where it matters most: judging a revision
      // as if it were a first draft throws away the only thing that makes the
      // second round worth its calls — whether the notes were acted on.
      if (node.role === "judge") {
        return node.round && node.round > 1
          ? `You are the JUDGE, in ROUND ${node.round}. You have judged this task before and your earlier verdict is above: what you are reading now is a REVISED round. Say whether the revision answers that verdict, then pick the strongest answer as it stands now and say plainly why. If nothing has actually changed since your last pass, say so rather than restating it, and if the answers cannot be separated on the evidence, say the panel cannot decide — that is a valid verdict.`
          : `You are the JUDGE. Pick the strongest answer above, say plainly why, and name what the others got right. If they cannot be separated on the evidence, say the panel cannot decide — that is a valid verdict.`;
      }
      // A synthesizing MANAGER deliberately gets no round branch. Its round
      // counts solo manager stages, and in a plain fan-out the second of those
      // is the CLOSING MERGE, not a second pass — telling it "you are in round
      // 2, build on the earlier round" would be the same false claim FIX 3 just
      // took out of the worker brief, and it would fire on the most ordinary
      // shape in the app. Merging what is above already is building on it.
      return `You are the MANAGER. Merge the workers' answers into one result the operator can act on. Name any disagreement instead of averaging it away.`;
  }
}
