import { describe, it, expect } from "vitest";
import { PRESETS, PRESET_IDS, briefFor, callCount, plan, type Topology } from "./topology";

const four = ["strat", "forge", "critic", "oracle"];

describe("topology presets — the shape is data", () => {
  it("every preset builds from a roster and keeps every agent", () => {
    for (const id of PRESET_IDS) {
      const t = PRESETS[id](four);
      expect(t.nodes.map((n) => n.agentId).sort()).toEqual([...four].sort());
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it("fan-out makes the first agent the manager and the rest workers", () => {
    const t = PRESETS.fanout(four);
    expect(t.nodes[0]).toMatchObject({ role: "manager", agentId: "strat" });
    expect(t.nodes.slice(1).every((n) => n.role === "worker")).toBe(true);
  });

  it("a panel ends with a judge", () => {
    const t = PRESETS.panel(four);
    expect(t.nodes[t.nodes.length - 1]).toMatchObject({ role: "judge", agentId: "oracle" });
  });
});

describe("plan — what actually runs, in order", () => {
  it("fan-out is decompose → concurrent workers → synthesize", () => {
    const phases = plan(PRESETS.fanout(four));
    expect(phases.map((p) => p.kind)).toEqual(["decompose", "fanout", "synthesize"]);
    const fan = phases[1];
    expect(fan.kind === "fanout" && fan.nodes).toHaveLength(3);
    // the manager both opens and closes the run
    expect(phases[0].kind === "decompose" && phases[0].node.agentId).toBe("strat");
    expect(phases[2].kind === "synthesize" && phases[2].node.agentId).toBe("strat");
  });

  it("a panel drafts concurrently, then judges once", () => {
    expect(plan(PRESETS.panel(four)).map((p) => p.kind)).toEqual(["fanout", "synthesize"]);
  });

  it("loop and pipeline are purely sequential — no concurrency", () => {
    for (const id of ["loop", "pipeline"]) {
      const phases = plan(PRESETS[id](four));
      expect(phases.every((p) => p.kind === "sequence")).toBe(true);
    }
  });

  it("degrades instead of throwing when a shape is missing its lead", () => {
    const headless: Topology = { id: "fanout", label: "x", blurb: "", nodes: [{ id: "w", role: "worker", agentId: "forge" }] };
    expect(() => plan(headless)).not.toThrow();
    expect(plan(headless)).toEqual([{ kind: "sequence", nodes: headless.nodes }]);
    const empty: Topology = { id: "panel", label: "x", blurb: "", nodes: [] };
    expect(plan(empty)).toEqual([]);
  });
});

describe("callCount — the price is visible before you pay it", () => {
  it("counts every model call a run will make", () => {
    // fan-out with 4 agents: 1 decompose + 3 workers + 1 synthesize
    expect(callCount(PRESETS.fanout(four))).toBe(5);
    // panel: 3 drafts + 1 judge
    expect(callCount(PRESETS.panel(four))).toBe(4);
    // sequential shapes cost one call per agent
    expect(callCount(PRESETS.loop(four))).toBe(4);
    expect(callCount(PRESETS.pipeline(four))).toBe(4);
  });

  it("a fan-out always costs more than the loop it replaces", () => {
    expect(callCount(PRESETS.fanout(four))).toBeGreaterThan(callCount(PRESETS.loop(four)));
  });
});

describe("briefs — each node is told its job, not everyone's", () => {
  const mgr = { id: "mgr", role: "manager" as const, agentId: "strat" };
  const judge = { id: "j", role: "judge" as const, agentId: "oracle" };

  it("the manager is told to split and NOT to answer", () => {
    const b = briefFor("decompose", mgr, "ship the thing");
    expect(b).toContain("ship the thing");
    expect(b).toMatch(/do not answer the task yourself/i);
  });

  it("a worker is told to answer only its own sub-task", () => {
    expect(briefFor("fanout", { id: "w", role: "worker", agentId: "forge" }, "t")).toMatch(/only your own sub-task/i);
  });

  it("a judge may return the honest non-verdict", () => {
    expect(briefFor("synthesize", judge, "t")).toMatch(/cannot decide/i);
  });

  it("a manager synthesizing names disagreement rather than averaging it", () => {
    expect(briefFor("synthesize", mgr, "t")).toMatch(/disagreement/i);
  });
});
