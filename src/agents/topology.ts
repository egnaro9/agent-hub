// Harness shapes as data.
//
// harness-builder proved the idea on mock tasks: a harness is roles + wiring,
// so you can draw the shape and sweep it. This is the same idea with the mocks
// removed — the nodes are real agents on real models, and running a shape
// executes it in a room. The result of that sweep is also why the presets here
// are small: more scaffolding scored WORSE on a 20-task suite, so a fan-out is
// offered as a choice, never as the default.
//
// v1 limits, deliberate: depth 1 (a manager fans to workers; workers do not
// spawn workers) and a fixed set of shapes rather than a graph editor. Both
// keep the cost legible and the transcript readable.

export type NodeRole = "manager" | "worker" | "judge";

export interface TopologyNode {
  /** Stable within a topology; also the label shown in the transcript. */
  id: string;
  role: NodeRole;
  /** Which hub agent speaks this node. */
  agentId: string;
}

export interface Topology {
  id: string;
  label: string;
  /** One line the UI shows before you spend anything. */
  blurb: string;
  nodes: TopologyNode[];
}

export type Phase =
  | { kind: "decompose"; node: TopologyNode }
  | { kind: "fanout"; nodes: TopologyNode[] } // these run CONCURRENTLY
  | { kind: "sequence"; nodes: TopologyNode[] } // these run in order, each seeing the last
  | { kind: "synthesize"; node: TopologyNode };

/** The shapes on offer. `loop` is what the room already did before topologies. */
export const PRESETS: Record<string, (agents: string[]) => Topology> = {
  loop: (agents) => ({
    id: "loop",
    label: "loop",
    blurb: "Everyone speaks in turn, each seeing what came before.",
    nodes: agents.map((a, i) => ({ id: `t${i}`, role: "worker" as const, agentId: a })),
  }),
  fanout: (agents) => ({
    id: "fanout",
    label: "fan-out",
    blurb: "A manager splits the task, workers answer in parallel, the manager merges.",
    nodes: [
      { id: "mgr", role: "manager", agentId: agents[0] },
      ...agents.slice(1).map((a, i) => ({ id: `w${i}`, role: "worker" as const, agentId: a })),
    ],
  }),
  panel: (agents) => ({
    id: "panel",
    label: "panel",
    blurb: "Independent answers from each agent, then a judge picks and says why.",
    nodes: [
      ...agents.slice(0, -1).map((a, i) => ({ id: `d${i}`, role: "worker" as const, agentId: a })),
      { id: "judge", role: "judge", agentId: agents[agents.length - 1] },
    ],
  }),
  pipeline: (agents) => ({
    id: "pipeline",
    label: "pipeline",
    blurb: "Hand-off in order: each agent works on the previous one's output.",
    nodes: agents.map((a, i) => ({ id: `p${i}`, role: "worker" as const, agentId: a })),
  }),
};

export const PRESET_IDS = Object.keys(PRESETS);

/**
 * The execution plan for a topology: an ordered list of phases. Fan-out phases
 * are the only concurrent ones — everything else is sequential so the
 * transcript stays readable.
 */
export function plan(topology: Topology): Phase[] {
  const managers = topology.nodes.filter((n) => n.role === "manager");
  const judges = topology.nodes.filter((n) => n.role === "judge");
  const workers = topology.nodes.filter((n) => n.role === "worker");

  switch (topology.id) {
    case "fanout": {
      const mgr = managers[0];
      if (!mgr || workers.length === 0) return workers.length ? [{ kind: "sequence", nodes: workers }] : [];
      return [
        { kind: "decompose", node: mgr },
        { kind: "fanout", nodes: workers },
        { kind: "synthesize", node: mgr },
      ];
    }
    case "panel": {
      const judge = judges[0];
      if (!judge) return workers.length ? [{ kind: "fanout", nodes: workers }] : [];
      return [{ kind: "fanout", nodes: workers }, { kind: "synthesize", node: judge }];
    }
    case "pipeline":
      return workers.length ? [{ kind: "sequence", nodes: workers }] : [];
    case "loop":
    default:
      return workers.length ? [{ kind: "sequence", nodes: workers }] : [];
  }
}

/**
 * How many model calls a run costs, before spending any of them. The UI shows
 * this next to the launch button — a fan-out of four is five calls, and that
 * should be visible rather than discovered on a bill.
 */
export function callCount(topology: Topology): number {
  return plan(topology).reduce(
    (n, phase) => n + (phase.kind === "fanout" ? phase.nodes.length : phase.kind === "sequence" ? phase.nodes.length : 1),
    0
  );
}

/** What each node is told to do, by role and phase. */
export function briefFor(phase: Phase["kind"], node: TopologyNode, task: string): string {
  switch (phase) {
    case "decompose":
      return `You are the MANAGER of this run. The operator's task: "${task}". Split it into one clear sub-task per worker, addressed to them by name, in at most four lines. Do not answer the task yourself.`;
    case "fanout":
      return `You are a WORKER on this run. Answer only your own sub-task from the manager's split, in your own function's voice. Do not summarize the others.`;
    case "sequence":
      return `Continue the work on: "${task}". Build on what has already been said rather than repeating it.`;
    case "synthesize":
      return node.role === "judge"
        ? `You are the JUDGE. Pick the strongest answer above, say plainly why, and name what the others got right. If they cannot be separated on the evidence, say the panel cannot decide — that is a valid verdict.`
        : `You are the MANAGER. Merge the workers' answers into one result the operator can act on. Name any disagreement instead of averaging it away.`;
  }
}
