import type { Message } from "../types";

// The seam between the hub and gradecore: a finished run, as ONE JSON file a
// grading script can consume without ever touching the app. The export records
// only what the room already shows the operator — the transcript slice from
// the task line down, node stamps included — plus the run's own pinned
// conditions. Nothing in here is knowledge the operator didn't have; an export
// that recorded MORE than the room shows would violate the trust architecture.
// Schema documented in docs/RUN_EXPORT_SCHEMA.md — keep the two in lockstep.

export interface RunExportNode {
  /** Phase kind this node ran under: decompose | fanout | sequence | handoff | solo… */
  phase: string;
  /** The node's id inside the topology, e.g. "mgr", "w1", "h2". */
  nodeId: string;
  role: string;
  agentId: string;
  /** The model this node's requests were actually routed to. */
  model: string;
  /**
   * Hand provenance, handoff links only: the id of the ONE message this link
   * was shown. null everywhere else (the node read the room's window instead).
   */
  handedFrom: string | null;
}

export interface RunExportV1 {
  version: 1;
  exportedAt: string;
  project: string;
  shape: { id: string; label: string };
  task: string;
  /** The run's pinned conditions — every artifact names its own. */
  config: { maxTokens: number; temperature?: number; routeByRole: boolean };
  /** The launcher's floor ("N+") and the exact measured spend. */
  quoted: number;
  spent: number;
  startedAt: string;
  endedAt: string;
  /** One record per node turn, in execution order. */
  nodes: RunExportNode[];
  /**
   * The room's transcript from the task line to the end of the run — exactly
   * what the operator saw, including gate cards and tool-trace rows.
   */
  messages: Message[];
}

/** Serialize + trigger a browser download. Lives here so the bar stays thin. */
export const downloadRunExport = (run: RunExportV1) => {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `run-${run.shape.id}-${run.endedAt.replace(/[:.]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
