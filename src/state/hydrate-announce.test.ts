import { describe, it, expect, vi } from "vitest";

// The room-entry announcement ("Pulled the live feed…") lives in a channel
// that PERSISTS, while the once-per-session hydration guard does not — so
// before the dedup, every reload re-announced the same pull into the saved
// transcript (observed live: five identical greetings). These tests pin the
// contract: announce once per DISTINCT latest commit, never per visit.

vi.mock("../data/github", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../data/github")>();
  return {
    ...mod,
    fetchRecentCommits: vi.fn(async () => ['Add a licence · 4d ago']),
    fetchRepoWork: vi.fn(async () => null),
    fetchHubBranches: vi.fn(async () => ({ status: "empty", branches: [] })),
  };
});

import { useHub } from "./hub";

const ANNOUNCE = 'Pulled the live feed — latest commit here is "Add a licence · 4d ago". Working from that, not from memory.';

const seedChannel = (projectId: string, messages: { id: string; from: string; text: string }[]) => {
  useHub.setState((s) => ({
    channels: {
      ...s.channels,
      [projectId]: { participants: ["critic"], messages, queue: [] },
    },
  }));
};

describe("the room-entry announcement", () => {
  it("announces a fresh pull exactly once", async () => {
    seedChannel("crashkit", []);
    await useHub.getState().hydrateActivity("crashkit");
    const ch = useHub.getState().channels["crashkit"];
    const count =
      ch.queue.filter((q) => q.text === ANNOUNCE).length +
      ch.messages.filter((m) => m.text === ANNOUNCE).length;
    expect(count).toBe(1);
  });

  it("does NOT re-announce a pull the persisted transcript already carries", async () => {
    // a rehydrated store: the transcript already holds the greeting
    seedChannel("gradecore", [{ id: "m1", from: "critic", text: ANNOUNCE }]);
    await useHub.getState().hydrateActivity("gradecore");
    const ch = useHub.getState().channels["gradecore"];
    expect(ch.queue.filter((q) => q.text === ANNOUNCE)).toHaveLength(0);
    expect(ch.messages.filter((m) => m.text === ANNOUNCE)).toHaveLength(1);
    // the live feed itself still lands — dedup silences the GREETING only
    expect(useHub.getState().projects.find((p) => p.id === "gradecore")?.liveActivity?.[0]).toBe("Add a licence · 4d ago");
  });
});
