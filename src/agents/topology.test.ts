import { describe, it, expect, beforeEach } from "vitest";
import { PRESETS, PRESET_IDS, briefFor, callCount, plan, type Stage, type Topology } from "./topology";
import { deleteShape, getShape, listShapes, saveShape, toTopology, validateShape } from "./customShapes";

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
    // The old assertion read `p.kind === "sequence"` for BOTH, which was only
    // ever true because pipeline was a duplicate of loop. That proxy was the
    // bug, not the contract: what these two shapes actually promise is that
    // nobody runs concurrently. Asserted directly now, so the test survives
    // pipeline becoming a real hand-off.
    for (const id of ["loop", "pipeline"]) {
      const phases = plan(PRESETS[id](four));
      expect(phases.some((p) => p.kind === "fanout")).toBe(false);
    }
  });

  it("loop and pipeline do NOT plan identically", () => {
    // The defect this suite missed for a whole release: both presets expanded
    // to one `sequence` stage, so the two chips produced the same plan, the
    // same price and the same briefs. Nothing was red — every assertion about
    // pipeline was equally true of loop, which is exactly how a duplicate
    // survives. Side by side the chips read as a comparison, so an operator
    // switching between them was told a shape had changed when none had.
    const loop = plan(PRESETS.loop(four));
    const pipeline = plan(PRESETS.pipeline(four));
    expect(pipeline).not.toEqual(loop);
    expect(loop.map((p) => p.kind)).toEqual(["sequence"]);
    expect(pipeline.map((p) => p.kind)).toEqual(["handoff"]);
    // and the difference reaches the words the agents are actually given
    const step = (phases: ReturnType<typeof plan>) =>
      phases[0].kind === "sequence" || phases[0].kind === "handoff" ? phases[0].nodes[1] : null;
    expect(briefFor("sequence", step(loop)!, "t")).not.toBe(briefFor("handoff", step(pipeline)!, "t"));
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

  it("a one-agent fan-out costs nothing and plans nothing", () => {
    // The room a fresh install starts in has exactly one agent. With no workers
    // to split among, the manager's two solo stages are pure spend: "split this
    // among your workers" and "merge the workers' answers", twice billed for a
    // fan-out that never happened. 0 is what makes the launcher refuse it.
    expect(callCount(PRESETS.fanout(["strat"]))).toBe(0);
    expect(plan(PRESETS.fanout(["strat"]))).toEqual([]);
    expect(callCount(PRESETS.fanout([]))).toBe(0);
    // two is the smallest room where there IS something to fan out
    expect(callCount(PRESETS.fanout(["strat", "forge"]))).toBe(3);
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

  it("a repeated JUDGE is told it is re-judging, not judging fresh", () => {
    // The composer badges the stage "round 2" and promises its agent is told to
    // build on the earlier round. That promise only ever held for fan-outs, so
    // a round-2 judge got the badge and a byte-identical brief.
    const b = briefFor("synthesize", { ...judge, round: 2 }, "t");
    expect(b).toMatch(/round 2/i);
    expect(b).toMatch(/revised/i);
    expect(b).toMatch(/your earlier verdict/i);
    expect(b).not.toBe(briefFor("synthesize", judge, "t"));
    // and it keeps the honest non-verdict it had in round 1
    expect(b).toMatch(/cannot decide/i);
  });

  it("a repeated SEQUENCE stage is told to revise, not to restart", () => {
    const step = { id: "p0", role: "worker" as const, agentId: "forge" };
    const b = briefFor("sequence", { ...step, round: 2 }, "ship the thing");
    expect(b).toContain("ship the thing");
    expect(b).toMatch(/round 2/i);
    expect(b).toMatch(/rather than restarting/i);
    expect(b).not.toBe(briefFor("sequence", step, "ship the thing"));
  });

  it("claims only what a repeated stage guarantees — no verdict that may not exist", () => {
    // fan-out → fan-out is a legal shape: nothing makes a judge run in between,
    // so a round-2 worker cannot be told "the verdict on them is above".
    const w2 = { id: "w0r2", role: "worker" as const, agentId: "forge", round: 2 };
    expect(briefFor("fanout", w2, "t")).not.toMatch(/\bthe verdict\b/i);
    // and the closing manager of a PLAIN fan-out is already round 2 of
    // solo:manager, so it must not be told a revision happened — its second
    // turn is the merge, which is the whole shape working as designed
    expect(briefFor("synthesize", { ...mgr, round: 2 }, "t")).toBe(briefFor("synthesize", mgr, "t"));
    expect(briefFor("synthesize", { ...mgr, round: 2 }, "t")).toContain("Merge the workers' answers");
  });
});

describe("handoff — an assembly line, not a conversation", () => {
  beforeEach(() => localStorage.clear());
  const chain = (agentIds: string[]): Stage[] => [{ kind: "handoff", role: "worker", agentIds }];
  const nodesOf = (stages: Stage[], i = 0) => {
    const phase = plan(toTopology({ id: "c", label: "c", stages }))[i];
    return phase.kind === "handoff" || phase.kind === "sequence" || phase.kind === "fanout" ? phase.nodes : [];
  };

  it("costs exactly what the sequence it mirrors costs", () => {
    // The distinction is context visibility and NOTHING else. If it also moved
    // the price, a run comparing the two shapes would be comparing two things.
    expect(callCount(PRESETS.pipeline(four))).toBe(callCount(PRESETS.loop(four)));
    expect(callCount(toTopology({ id: "c", label: "c", stages: chain(four) }))).toBe(4);
  });

  it("runs in order, and never concurrently", () => {
    // What the old "loop and pipeline are purely sequential" test was reaching
    // for, asserted against concurrency itself rather than against one kind's
    // name: fan-out is the only phase the runner is allowed to parallelise.
    expect(plan(PRESETS.pipeline(four)).some((p) => p.kind === "fanout")).toBe(false);
    expect(nodesOf(chain(four)).map((n) => n.agentId)).toEqual(four);
  });

  it("marks the head of the chain, and only when nothing ran before it", () => {
    expect(nodesOf(chain(four)).map((n) => n.head)).toEqual([true, undefined, undefined, undefined]);
    // A manager's split ahead of the same stage IS something handed down, so
    // the first worker is no longer the start of anything.
    const led: Stage[] = [{ kind: "solo", role: "manager", agentIds: ["strat"] }, ...chain(["forge", "critic"])];
    expect(nodesOf(led, 1).every((n) => n.head === undefined)).toBe(true);
  });

  it("tells the first agent it was handed nothing, and hands it the task", () => {
    const head = nodesOf(chain(four))[0];
    const b = briefFor("handoff", head, "ship the thing");
    expect(b).toContain("ship the thing");
    expect(b).toMatch(/nobody has handed you anything/i);
    // the failure mode this edge exists for: implying an upstream that is not
    // there, which makes the opener spend its turn hunting for missing context
    expect(b).not.toMatch(/above/i);
    expect(b).not.toMatch(/previous agent|the agent before/i);
  });

  it("tells every later agent it gets ONE upstream result and can see nothing earlier", () => {
    const b = briefFor("handoff", nodesOf(chain(four))[2], "ship the thing");
    expect(b).toMatch(/one thing/i);
    expect(b).toMatch(/immediately before you/i);
    expect(b).toMatch(/cannot see anything earlier/i);
    // the task is withheld on purpose — restating it at every station hands
    // back the context the shape exists to withhold
    expect(b).not.toContain("ship the thing");
  });

  it("says the output IS the artifact, because there is no back-channel", () => {
    // A sequence agent can defer to whoever speaks next; they share a
    // transcript and can answer. Here a question travels down the line in the
    // artifact's place and never comes back answered.
    for (const node of nodesOf(chain(four))) {
      const b = briefFor("handoff", node, "t");
      expect(b).toMatch(/AS the artifact/);
      expect(b).toMatch(/question/i);
    }
  });

  it("gives the head and the links genuinely different briefs", () => {
    const [head, next] = nodesOf(chain(four));
    expect(briefFor("handoff", head, "t")).not.toBe(briefFor("handoff", next, "t"));
  });

  it("honours node.round the way every other repeatable kind does", () => {
    const twice: Stage[] = [...chain(["strat", "forge"]), ...chain(["critic", "oracle"])];
    const r1 = nodesOf(twice, 0);
    const r2 = nodesOf(twice, 1);
    expect(r1.map((n) => n.id)).toEqual(["h0", "h1"]);
    expect(r2.map((n) => n.id)).toEqual(["h0r2", "h1r2"]);
    expect(r1[0].round).toBeUndefined();
    expect(r2[0].round).toBe(2);
    // round 2's first link is NOT the head — round 1's tail handed it something
    expect(r2[0].head).toBeUndefined();
    const b = briefFor("handoff", r2[0], "t");
    expect(b).toMatch(/round 2/i);
    expect(b).toMatch(/rather than starting it again/i);
    expect(b).not.toBe(briefFor("handoff", r1[1], "t"));
  });

  it("does not share node ids with a sequence stage in the same shape", () => {
    // Both are round 1 of worker, so a shared prefix would put two different
    // nodes in one transcript under the name "p0".
    const mixed: Stage[] = [{ kind: "sequence", role: "worker", agentIds: ["strat"] }, ...chain(["forge"])];
    expect(nodesOf(mixed, 0).map((n) => n.id)).toEqual(["p0"]);
    expect(nodesOf(mixed, 1).map((n) => n.id)).toEqual(["h0"]);
  });

  it("leaves shapes saved before handoff existed behaving exactly as they did", () => {
    // Storage carries `sequence`, and a stored sequence is still a sequence —
    // nothing is migrated, so a shape composed last week plans, prices and
    // briefs byte-identically to a shape composed today.
    saveShape({ id: "old", label: "old", stages: [{ kind: "sequence", role: "worker", agentIds: four }] });
    const restored = toTopology(getShape("old")!);
    expect(plan(restored).map((p) => p.kind)).toEqual(["sequence"]);
    expect(callCount(restored)).toBe(4);
    const step = plan(restored)[0];
    expect(step.kind === "sequence" && step.nodes.map((n) => n.id)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(step.kind === "sequence" && briefFor("sequence", step.nodes[0], "t")).toMatch(/build on what has already been said/i);
    expect(step.kind === "sequence" && step.nodes.every((n) => n.head === undefined)).toBe(true);
  });
});

// A composed shape: two rounds of workers, each round judged before the next.
const twoRounds: Stage[] = [
  { kind: "solo", role: "manager", agentIds: ["strat"] },
  { kind: "fanout", role: "worker", agentIds: ["forge", "critic", "probe"] },
  { kind: "solo", role: "judge", agentIds: ["oracle"] },
  { kind: "fanout", role: "worker", agentIds: ["forge", "critic"] },
  { kind: "solo", role: "judge", agentIds: ["oracle"] },
];
const multi = () => toTopology({ id: "two-rounds", label: "two rounds", stages: twoRounds });

describe("custom shapes — the runner reads stages, not the shape's name", () => {
  it("plans a multi-round shape the presets could not express", () => {
    const phases = plan(multi());
    expect(phases.map((p) => p.kind)).toEqual(["decompose", "fanout", "synthesize", "fanout", "synthesize"]);
    // the second solo is a judge reading round 1, not a fresh decompose
    expect(phases[2].kind === "synthesize" && phases[2].node.role).toBe("judge");
    expect(phases[3].kind === "fanout" && phases[3].nodes.map((n) => n.agentId)).toEqual(["forge", "critic"]);
  });

  it("keeps one node per agent even when an agent speaks in three stages", () => {
    expect(multi().nodes.map((n) => n.agentId)).toEqual(["strat", "forge", "critic", "probe", "oracle"]);
  });

  it("prices a custom shape exactly — the quote is the spend", () => {
    // 1 manager + 3 workers + 1 judge + 2 workers + 1 judge
    expect(callCount(multi())).toBe(8);
    const spent = plan(multi()).reduce((n, p) => n + (p.kind === "fanout" || p.kind === "sequence" ? p.nodes.length : 1), 0);
    expect(spent).toBe(callCount(multi()));
  });

  it("never spends more than it quoted when a stage is over-full or empty", () => {
    // a solo stage naming two agents still speaks once, and an empty stage costs nothing
    const sloppy = toTopology({
      id: "sloppy",
      label: "sloppy",
      stages: [
        { kind: "solo", role: "manager", agentIds: ["strat", "forge"] },
        { kind: "fanout", role: "worker", agentIds: [] },
        { kind: "fanout", role: "worker", agentIds: ["critic"] },
      ],
    });
    expect(callCount(sloppy)).toBe(2);
    expect(plan(sloppy).map((p) => p.kind)).toEqual(["decompose", "fanout"]);
  });

  it("tells a second-round worker it is building on the previous round", () => {
    const phases = plan(multi());
    const round1 = phases[1].kind === "fanout" ? phases[1].nodes[0] : null;
    const round2 = phases[3].kind === "fanout" ? phases[3].nodes[0] : null;
    expect(round1?.round).toBeUndefined();
    expect(round2?.round).toBe(2);
    expect(briefFor("fanout", round1!, "t")).toMatch(/only your own sub-task/i);
    const b = briefFor("fanout", round2!, "t");
    expect(b).toMatch(/round 2/i);
    expect(b).toMatch(/do not start over/i);
  });

  it("gives round-2 nodes their own ids so the transcript can tell the rounds apart", () => {
    const phases = plan(multi());
    const r1 = phases[1].kind === "fanout" ? phases[1].nodes.map((n) => n.id) : [];
    const r2 = phases[3].kind === "fanout" ? phases[3].nodes.map((n) => n.id) : [];
    expect(r1).toEqual(["w0", "w1", "w2"]);
    expect(r2).toEqual(["w0r2", "w1r2"]);
  });

  it("does not invent a second manager — a solo keeps one id across rounds", () => {
    // Fan-out's closing manager IS the opening manager, speaking again. "mgr2"
    // reads in the transcript as someone who was never in the room, and it
    // renames a node that older saved transcripts already refer to.
    const fan = plan(PRESETS.fanout(four));
    expect(fan[0].kind === "decompose" && fan[0].node.id).toBe("mgr");
    expect(fan[2].kind === "synthesize" && fan[2].node.id).toBe("mgr");
    // the round still rides on the node — the badge and the briefs read that
    expect(fan[2].kind === "synthesize" && fan[2].node.round).toBe(2);
    const phases = plan(multi());
    expect(phases[2].kind === "synthesize" && phases[2].node.id).toBe("judge");
    expect(phases[4].kind === "synthesize" && phases[4].node.id).toBe("judge");
    expect(phases[4].kind === "synthesize" && phases[4].node.round).toBe(2);
  });
});

describe("validateShape — a bad shape cannot reach a model call", () => {
  const roster = ["strat", "forge", "critic", "oracle", "probe"];
  const solo = (agentIds: string[]): Stage => ({ kind: "solo", role: "manager", agentIds });

  it("passes a shape whose stages are all runnable", () => {
    expect(validateShape(twoRounds, roster)).toEqual([]);
  });

  it("rejects an empty shape", () => {
    expect(validateShape([], roster)).toHaveLength(1);
    expect(validateShape([], roster)[0]).toMatch(/at least one stage/i);
  });

  it("rejects more than eight stages", () => {
    const nine = Array.from({ length: 9 }, () => solo(["strat"]));
    expect(validateShape(nine, roster).some((p) => /at most 8 stages/i.test(p))).toBe(true);
  });

  it("rejects a stage with no agents", () => {
    expect(validateShape([solo([])], roster).some((p) => /no agents/i.test(p))).toBe(true);
  });

  it("rejects more than six agents in a stage", () => {
    const seven = ["strat", "forge", "critic", "oracle", "probe", "ops", "porter"];
    const problems = validateShape([{ kind: "fanout", role: "worker", agentIds: seven }], [...roster, "ops", "porter"]);
    expect(problems.some((p) => /the cap is 6/i.test(p))).toBe(true);
  });

  it("rejects a SINGLE stage that names more than one agent", () => {
    expect(validateShape([solo(["strat", "forge"])], roster).some((p) => /pick one/i.test(p))).toBe(true);
  });

  it("rejects an agent who is not in the room", () => {
    const problems = validateShape([{ kind: "fanout", role: "worker", agentIds: ["forge", "ghost"] }], roster);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/ghost/);
  });

  it("fails closed when the caller has no roster to check against", () => {
    expect(validateShape(twoRounds, []).length).toBeGreaterThan(0);
  });
});

describe("saved shapes — storage that cannot take the app down", () => {
  beforeEach(() => localStorage.clear());

  it("a saved shape survives a round-trip", () => {
    saveShape({ id: "two-rounds", label: "two rounds", stages: twoRounds });
    expect(getShape("two-rounds")).toEqual({ id: "two-rounds", label: "two rounds", stages: twoRounds });
    expect(listShapes().map((s) => s.id)).toEqual(["two-rounds"]);
    // and it plans and prices identically once it comes back off disk
    expect(callCount(toTopology(getShape("two-rounds")!))).toBe(8);
  });

  it("deleting one shape leaves the others", () => {
    saveShape({ id: "a", label: "a", stages: twoRounds });
    saveShape({ id: "b", label: "b", stages: twoRounds });
    deleteShape("a");
    expect(getShape("a")).toBeNull();
    expect(listShapes().map((s) => s.id)).toEqual(["b"]);
  });

  it("survives corrupt storage instead of taking the app down", () => {
    localStorage.setItem("agent-hub:custom-shapes", "{not json");
    expect(listShapes()).toEqual([]);
    localStorage.setItem("agent-hub:custom-shapes", '["an","array"]');
    expect(listShapes()).toEqual([]);
    // a half-written shape is dropped whole — a shape missing a stage would
    // still run, just not the one that was saved — and valid siblings survive
    localStorage.setItem(
      "agent-hub:custom-shapes",
      JSON.stringify({
        broken: { label: "broken", stages: [{ kind: "solo", role: "manager" }] },
        alien: { label: "alien", stages: [{ kind: "swarm", role: "worker", agentIds: ["forge"] }] },
        good: { label: "good", stages: twoRounds },
      })
    );
    expect(listShapes().map((s) => s.id)).toEqual(["good"]);
    expect(getShape("broken")).toBeNull();
    expect(getShape("alien")).toBeNull();
  });

  it("drops a stored shape that has taken a built-in's name", () => {
    // The composer refuses the name while you type, but storage is hand-editable
    // and outlives any one build's preset list. A surviving "loop" would shadow
    // the built-in in every room — the runner looks saved shapes up first — and
    // put two chips on one React key in the strip.
    localStorage.setItem(
      "agent-hub:custom-shapes",
      JSON.stringify({
        loop: { label: "not the real loop", stages: twoRounds },
        mine: { label: "mine", stages: twoRounds },
      })
    );
    expect(listShapes().map((s) => s.id)).toEqual(["mine"]);
    expect(getShape("loop")).toBeNull();
    for (const id of PRESET_IDS) expect(getShape(id)).toBeNull();
  });

  it("refuses to save something that would read back as nothing", () => {
    saveShape({ id: "", label: "no id", stages: twoRounds });
    saveShape({ id: "hollow", label: "hollow", stages: [] });
    expect(listShapes()).toEqual([]);
  });
});

// Three defects a cold critic found after the hand-off landed. Each one was
// reachable through the composer and invisible to the compiler, so each gets a
// test rather than a comment.
describe("hand-off — the three the critic caught", () => {
  beforeEach(() => localStorage.clear());

  it("gives every node a UNIQUE id, even across same-kind stages", () => {
    // rounds is keyed kind:role, so a handoff stage of workers and a handoff
    // stage of judges were BOTH round 1 and both generated "h0". The runner
    // finds a node's output by first id match, so the collision handed the next
    // link the wrong message — and leaked text the hand-off exists to withhold.
    const stages: Stage[] = [
      { kind: "handoff", role: "worker", agentIds: ["strat", "forge"] },
      { kind: "handoff", role: "judge", agentIds: ["critic"] },
      { kind: "handoff", role: "worker", agentIds: ["oracle"] },
    ];
    const t = toTopology({ id: "chain", label: "chain", stages });
    const ids = plan(t).flatMap((p) => ("node" in p ? [p.node] : p.nodes)).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("saves and reloads a HAND-OFF shape instead of silently dropping it", () => {
    // KINDS is a RUNTIME allowlist and an array of a subset of a union still
    // typechecks, so omitting "handoff" compiled cleanly while sanitize()
    // discarded every composed hand-off shape on save.
    const stages: Stage[] = [{ kind: "handoff", role: "worker", agentIds: ["strat", "forge"] }];
    saveShape({ id: "line", label: "line", stages });
    expect(getShape("line")?.stages[0].kind).toBe("handoff");
    expect(plan(toTopology(getShape("line")!))[0].kind).toBe("handoff");
  });

  it("still marks only the true head when a chain follows another stage", () => {
    const t = toTopology({
      id: "led",
      label: "led",
      stages: [
        { kind: "solo", role: "manager", agentIds: ["strat"] },
        { kind: "handoff", role: "worker", agentIds: ["forge", "critic"] },
      ],
    });
    const chain = plan(t).find((p) => p.kind === "handoff")!;
    // Nobody in this chain opened the run, so nobody may be told the chain
    // starts with them — the manager above genuinely handed them something.
    expect(chain.kind === "handoff" && chain.nodes.every((n) => !n.head)).toBe(true);
    const first = chain.kind === "handoff" ? chain.nodes[0] : null;
    expect(briefFor("handoff", first!, "ship it")).not.toContain("the chain starts with you");
  });
});
