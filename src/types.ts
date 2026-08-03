import type { NodeRole, Phase } from "./agents/topology";

export interface Vec {
  x: number;
  y: number;
}

export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking"; note: string }
  | { kind: "working"; projectId: string }
  | { kind: "talking" }
  | { kind: "error"; note: string };

export type AgentScope = "global" | { projectId: string };

export interface Project {
  id: string;
  name: string;
  tagline: string;
  langs: string[];
  pos: Vec;
  hue: string;
  activity: string[];
  liveActivity?: string[]; // real commits from GitHub, hydrated lazily
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  glyph: string;
  pos: Vec;
  status: AgentStatus;
  scope: AgentScope;
}

export interface ProjectDetail {
  metrics: { label: string; value: string }[];
  tasks: { id: string; text: string; state: "done" | "doing" | "todo" }[];
}

/**
 * Provenance for a line spoken inside a topology run. A room transcript mixes
 * ordinary chat with the output of a shape (a manager splitting, three workers
 * answering at once, a judge deciding) — without this stamp those lines are
 * indistinguishable from someone just talking, and a fan-out reads as four
 * agents interrupting each other.
 */
export interface MessageNode {
  /** Which shape was running, e.g. "fanout" — matches Topology.id. */
  topology: string;
  /** Which phase of that shape produced this line. */
  phase: Phase["kind"];
  /** The node's id inside the topology, e.g. "mgr" or "w1". */
  id: string;
  role: NodeRole;
}

export interface Message {
  id: string;
  from: string; // agent id or "user"
  text: string;
  streaming?: boolean; // a live brain is still writing this one
  node?: MessageNode; // set when this line came out of a topology run
  action?: {
    tool: string;
    input: Record<string, unknown>;
    status: "pending" | "approved" | "dismissed";
    before?: string; // file contents as they exist today, for the diff card
  };
}

export interface QueuedLine {
  from: string;
  text: string;
}

export interface Conversation {
  id: string;
  kind: "solo" | "roundtable";
  participants: string[];
  topicId?: string;
  messages: Message[];
  queue: QueuedLine[];
}

export interface StructuralEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
