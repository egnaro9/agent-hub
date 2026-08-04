import { describe, expect, it } from "vitest";
import { AGENT_H, AGENT_W, PROJECT_H, PROJECT_W, arrangeLayout } from "./arrangeLayout";
import { AGENTS, PROJECTS, SEED_ASSIGNMENTS, STRUCTURAL } from "../data/mock";

// The arrange button's whole promise is geometric — no overlaps, sides that
// mean something, the same shape every click — so the tests measure boxes and
// sides rather than snapshotting coordinates. Coordinates may drift when the
// spacing constants are tuned; these properties may not.

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectsOf = (
  pos: Record<string, { x: number; y: number }>,
  agents: { id: string }[],
  projects: { id: string }[]
): Rect[] => [
  ...projects.map((p) => ({ id: p.id, ...pos[p.id], w: PROJECT_W, h: PROJECT_H })),
  ...agents.map((a) => ({ id: a.id, ...pos[a.id], w: AGENT_W, h: AGENT_H })),
];

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const overlappingPairs = (rects: Rect[]): string[] => {
  const bad: string[] = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (overlaps(rects[i], rects[j])) bad.push(`${rects[i].id} × ${rects[j].id}`);
  return bad;
};

// Which side of the agent column a project's center landed on.
const sideOf = (pos: Record<string, { x: number; y: number }>, id: string) =>
  pos[id].x + PROJECT_W / 2 < 0 ? "left" : "right";

// A synthetic board bigger than today's: the layout must still look deliberate
// at 30, which the brief pins to "grow layers, never overlap".
const bigBoard = () => {
  const projects = Array.from({ length: 30 }, (_, i) => ({ id: `proj-${String(i).padStart(2, "0")}` }));
  const structural = [
    // one 4-chain and two pairs, so clustering is exercised at scale too
    { source: "proj-00", target: "proj-01" },
    { source: "proj-01", target: "proj-02" },
    { source: "proj-02", target: "proj-03" },
    { source: "proj-10", target: "proj-11" },
    { source: "proj-20", target: "proj-21" },
  ];
  return { projects, structural };
};

describe("arrangeLayout", () => {
  it("lays out the real 18-project board with no overlapping cards", () => {
    const pos = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    expect(Object.keys(pos)).toHaveLength(AGENTS.length + PROJECTS.length);
    expect(overlappingPairs(rectsOf(pos, AGENTS, PROJECTS))).toEqual([]);
  });

  it("still holds at 30 projects: no overlaps, and layers grow instead of columns stretching", () => {
    const { projects, structural } = bigBoard();
    const pos = arrangeLayout(AGENTS, projects, structural, {});
    expect(overlappingPairs(rectsOf(pos, AGENTS, projects))).toEqual([]);
    // 15 a side at MAX_ROWS 5 is exactly 3 layers — distinct |x| bands per side.
    for (const sign of [-1, 1]) {
      const xs = new Set(
        projects.filter((p) => Math.sign(pos[p.id].x + PROJECT_W / 2) === sign).map((p) => pos[p.id].x)
      );
      expect(xs.size).toBeLessThanOrEqual(3);
    }
  });

  it("puts a worked project in the innermost layer of its side (the assignment-side rule)", () => {
    const pos = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    for (const workedId of new Set(Object.values(SEED_ASSIGNMENTS))) {
      const side = sideOf(pos, workedId);
      const dist = Math.abs(pos[workedId].x + PROJECT_W / 2);
      const sameSide = PROJECTS.filter((p) => sideOf(pos, p.id) === side);
      // Nothing on its side sits closer to the agent column than the project
      // an agent is actually working — that is what "shortens the edge" means
      // once the agents are a center column.
      const nearest = Math.min(...sameSide.map((p) => Math.abs(pos[p.id].x + PROJECT_W / 2)));
      expect(dist).toBe(nearest);
    }
  });

  it("splits two independently worked clusters across the two sides", () => {
    const agents = [{ id: "a1" }, { id: "a2" }];
    const projects = [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }, { id: "delta" }];
    const pos = arrangeLayout(agents, projects, [], { a1: "alpha", a2: "beta" });
    expect(sideOf(pos, "alpha")).not.toBe(sideOf(pos, "beta"));
  });

  it("never lets a structural cluster straddle the column", () => {
    const pos = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    for (const e of STRUCTURAL) {
      expect(sideOf(pos, e.source), `${e.source} → ${e.target} straddles the column`).toBe(sideOf(pos, e.target));
    }
    const { projects, structural } = bigBoard();
    const big = arrangeLayout(AGENTS, projects, structural, {});
    for (const e of structural) {
      expect(sideOf(big, e.source)).toBe(sideOf(big, e.target));
    }
  });

  it("keeps a cluster's members vertically adjacent, not scattered through their side", () => {
    const pos = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    // The eval stack: rag-eval-lab / eval-history / mcp-tools / prompt-regress /
    // eval-dashboard / agent-graph / llm-gateway are one connected component.
    const cluster = ["rag-eval-lab", "eval-history", "mcp-tools", "prompt-regress", "eval-dashboard", "agent-graph", "llm-gateway"];
    const side = sideOf(pos, cluster[0]);
    const sameSide = PROJECTS.filter((p) => sideOf(pos, p.id) === side)
      // side reading order = layer by layer, top to bottom — the slot order
      .sort((a, b) => Math.abs(pos[a.id].x) - Math.abs(pos[b.id].x) || pos[a.id].y - pos[b.id].y);
    const slots = cluster.map((id) => sameSide.findIndex((p) => p.id === id)).sort((a, b) => a - b);
    // Contiguous slot indices: max − min spans exactly the cluster size.
    expect(slots[slots.length - 1] - slots[0]).toBe(cluster.length - 1);
  });

  it("is deterministic and independent of input array order", () => {
    const a = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    const b = arrangeLayout(AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS);
    expect(a).toEqual(b);
    // Reversed input arrays must produce the identical constellation — the
    // caller's insert order is not part of the graph.
    const c = arrangeLayout(
      [...AGENTS].reverse(),
      [...PROJECTS].reverse(),
      [...STRUCTURAL].reverse(),
      SEED_ASSIGNMENTS
    );
    expect(c).toEqual(a);
  });
});
