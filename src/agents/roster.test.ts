import { describe, it, expect, beforeEach } from "vitest";
import { brainFor, clearAllOverrides, clearOverride, getOverride, getOverrides, setOverride } from "./roster";

const PRESET = { provider: "anthropic" as const, model: "claude-sonnet-4-6" };

describe("roster — which brain answers for an agent", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to the preset when nothing is overridden", () => {
    expect(brainFor("ops", PRESET)).toEqual(PRESET);
  });

  it("an override wins over the preset", () => {
    setOverride("ops", { provider: "google", model: "gemini-2.5-flash" });
    expect(brainFor("ops", PRESET)).toEqual({ provider: "google", model: "gemini-2.5-flash" });
    // and it does not leak onto other agents
    expect(brainFor("critic", PRESET)).toEqual(PRESET);
  });

  it("an override may deliberately go UP — the operator outranks the routing rule", () => {
    setOverride("ops", { provider: "anthropic", model: "claude-opus-4-8" });
    expect(brainFor("ops", { provider: "anthropic", model: "claude-haiku-4-5" }).model).toBe("claude-opus-4-8");
  });

  it("clearing one override restores just that agent", () => {
    setOverride("ops", { provider: "google", model: "gemini-2.5-flash" });
    setOverride("critic", { provider: "openai-compatible", model: "grok-4" });
    clearOverride("ops");
    expect(getOverride("ops")).toBeNull();
    expect(getOverride("critic")?.model).toBe("grok-4");
  });

  it("clearAllOverrides puts everyone back on the preset", () => {
    setOverride("ops", { provider: "google", model: "gemini-2.5-flash" });
    clearAllOverrides();
    expect(getOverrides()).toEqual({});
    expect(brainFor("ops", PRESET)).toEqual(PRESET);
  });

  it("survives corrupt storage instead of taking the app down", () => {
    localStorage.setItem("agent-hub:agent-brains", "{not json");
    expect(getOverrides()).toEqual({});
    localStorage.setItem("agent-hub:agent-brains", '["an","array"]');
    expect(getOverrides()).toEqual({});
    // a half-written entry is dropped, valid siblings survive
    localStorage.setItem(
      "agent-hub:agent-brains",
      JSON.stringify({ ops: { provider: "google" }, critic: { provider: "anthropic", model: "claude-opus-4-8" } })
    );
    expect(getOverride("ops")).toBeNull();
    expect(getOverride("critic")?.model).toBe("claude-opus-4-8");
  });
});
