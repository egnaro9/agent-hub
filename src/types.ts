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
  files: { name: string; kind: "file" | "pr"; meta: string }[];
}

export interface Message {
  id: string;
  from: string; // agent id or "user"
  text: string;
  streaming?: boolean; // a live brain is still writing this one
  action?: {
    tool: string;
    input: Record<string, unknown>;
    status: "pending" | "approved" | "dismissed";
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
