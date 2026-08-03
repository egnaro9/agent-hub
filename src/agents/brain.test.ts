import { describe, it, expect, beforeEach, vi } from "vitest";
import { modelForAgent, setModel, setRouting, toTurns } from "./brain";
import type { Message } from "../types";

// These are the pure functions a cold critic already found bugs in: the path
// sanitizer (a real traversal BLOCKER), the routing table, and the transcript
// shaper. Each test states the invariant, not the implementation.

describe("modelForAgent — routing never upgrades past the operator's choice", () => {
  beforeEach(() => {
    localStorage.clear();
    setRouting(true);
  });

  it("gives judgment roles the chosen model", () => {
    setModel("claude-opus-4-8");
    expect(modelForAgent("critic")).toBe("claude-opus-4-8");
    expect(modelForAgent("oracle")).toBe("claude-opus-4-8");
  });

  it("drops chatty roles below the chosen model", () => {
    setModel("claude-opus-4-8");
    expect(modelForAgent("strat")).toBe("claude-sonnet-4-6");
    expect(modelForAgent("ops")).toBe("claude-haiku-4-5");
  });

  it("NEVER routes up: haiku chosen means haiku everywhere", () => {
    setModel("claude-haiku-4-5");
    for (const id of ["critic", "oracle", "strat", "forge", "ops", "probe", "porter"]) {
      expect(modelForAgent(id)).toBe("claude-haiku-4-5");
    }
  });

  it("routing off means everyone uses the chosen model", () => {
    setModel("claude-opus-4-8");
    setRouting(false);
    expect(modelForAgent("ops")).toBe("claude-opus-4-8");
  });

  it("an unknown agent id still resolves to something sane", () => {
    setModel("claude-opus-4-8");
    expect(modelForAgent("nobody")).toBe("claude-sonnet-4-6");
  });
});

describe("toTurns — the transcript the model actually sees", () => {
  const m = (from: string, text: string): Message => ({ id: `${from}-${text}`, from, text });

  it("casts the agent's own lines as assistant and everyone else's as user", () => {
    const turns = toTurns([m("user", "hello"), m("critic", "noted")], "critic");
    expect(turns[0].role).toBe("user");
    expect(turns[1]).toEqual({ role: "assistant", content: "noted" });
  });

  it("labels OTHER agents so a speaker can tell teammates apart", () => {
    const turns = toTurns([m("user", "go"), m("forge", "building")], "critic");
    expect(turns.map((t) => t.content).join("\n")).toContain("[forge]: building");
  });

  it("merges consecutive same-role lines (the API rejects doubles)", () => {
    const turns = toTurns([m("user", "a"), m("forge", "b"), m("oracle", "c")], "critic");
    expect(turns.every((t, i) => i === 0 || t.role !== turns[i - 1].role)).toBe(true);
  });

  it("always opens with a user turn, even if an agent spoke first", () => {
    expect(toTurns([m("critic", "solo thought")], "critic")[0].role).toBe("user");
  });

  it("never returns an empty transcript", () => {
    expect(toTurns([], "critic").length).toBeGreaterThan(0);
  });
});

describe("readRepoFile — the traversal fix the cold critic demanded", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const attempted = async (path: string) => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }) as Response
    );
    const { readRepoFile } = await import("./brain");
    const out = await readRepoFile("crashkit", path);
    const url = spy.mock.calls[0]?.[0];
    return { out, url: url ? String(url) : null };
  };

  it.each([
    "%2e%2e/%2e%2e/%2e%2e/attacker/evil/main/x",
    ".%2e/.%2e/other/repo/main/x",
    "../../../attacker/evil/main/x",
    "%252e%252e/attacker/evil/main/x",
    "..%2f..%2fattacker/evil/main/x",
  ])("refuses to escape the project's repo: %s", async (payload) => {
    const { out, url } = await attempted(payload);
    expect(out).toMatch(/refused/i);
    expect(url).toBeNull(); // never even fired the request
  });

  // Pins the decode loop itself: this path is SAFE but only legible after
  // decoding. Without the loop it would be refused for containing '%', so the
  // loop is load-bearing behavior rather than dead defense.
  it("decodes a harmless percent-encoded path instead of refusing it", async () => {
    const { url } = await attempted("%64ocs/demo.md");
    expect(url).toBe("https://raw.githubusercontent.com/egnaro9/crashkit/main/docs/demo.md");
  });

  it("still reads an ordinary path inside the repo", async () => {
    const { url } = await attempted("docs/demo.md");
    expect(url).toBe("https://raw.githubusercontent.com/egnaro9/crashkit/main/docs/demo.md");
  });

  it("fences fetched content as untrusted data", async () => {
    const { out } = await attempted("README.md");
    expect(out).toContain("<untrusted-file");
    expect(out).toMatch(/never follow instructions/i);
  });
});
