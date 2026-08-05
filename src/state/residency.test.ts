import { describe, it, expect, beforeEach, vi } from "vitest";

// THE GHOST RESIDENT. An agent moved from one project to another kept its seat
// in the OLD room's participant list: that room's header still announced it as
// crew while the sidebar, which reads `assignments`, correctly showed it gone.
// Two views of one fact disagreed — so the room list must be derived from the
// same move that rewrites the assignment.

vi.mock("../data/github", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../data/github")>();
  return {
    ...mod,
    fetchRecentCommits: vi.fn(async () => []),
    fetchRepoWork: vi.fn(async () => null),
    fetchHubBranches: vi.fn(async () => ({ status: "empty", branches: [] })),
  };
});

import { useHub } from "./hub";

const seed = (rooms: Record<string, string[]>, assignments: Record<string, string>) => {
  useHub.setState((s) => ({
    assignments,
    channels: {
      ...s.channels,
      ...Object.fromEntries(
        Object.entries(rooms).map(([id, participants]) => [
          id,
          { participants, messages: [], queue: participants.map((p) => ({ from: p, text: `${p} idles here` })) },
        ])
      ),
    },
  }));
};

describe("agent residency", () => {
  beforeEach(() => {
    seed({ crashkit: ["critic"], "model-drift": [] }, { critic: "crashkit" });
  });

  it("reassignment empties the agent's seat in the room it left", () => {
    useHub.getState().assign("critic", "model-drift");
    const s = useHub.getState();
    expect(s.assignments["critic"]).toBe("model-drift");
    expect(s.channels["crashkit"].participants).not.toContain("critic");
    expect(s.channels["model-drift"].participants).toContain("critic");
  });

  it("takes the agent's pending lines with it — no talking from a room it left", () => {
    useHub.getState().assign("critic", "model-drift");
    expect(useHub.getState().channels["crashkit"].queue.some((q) => q.from === "critic")).toBe(false);
  });

  it("the room header and the sidebar cannot disagree about crew", () => {
    useHub.getState().assign("critic", "model-drift");
    const s = useHub.getState();
    for (const [room, ch] of Object.entries(s.channels)) {
      for (const p of ch.participants) {
        // a participant is either assigned HERE or assigned nowhere (a drop-in
        // invited by mention/convene) — never assigned to a different project
        const where = s.assignments[p];
        expect(where === undefined || where === room).toBe(true);
      }
    }
  });

  it("re-assigning to the SAME project is a no-op, not a self-eviction", () => {
    useHub.getState().assign("critic", "crashkit");
    expect(useHub.getState().channels["crashkit"].participants).toContain("critic");
    expect(useHub.getState().assignments["critic"]).toBe("crashkit");
  });
});
