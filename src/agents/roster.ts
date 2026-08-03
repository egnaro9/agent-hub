// Who thinks with what. Separate from the transport (providers.ts) and from
// the persona briefs (brain.ts) on purpose: this file answers exactly one
// question — for a given agent, which provider and model should answer?
//
// Three layers, in priority order:
//   1. an explicit per-agent override the operator set
//   2. the role tier preset (judgment roles strong, chatty roles cheap)
//   3. the single chosen model, if routing is off
// An override always wins, including over the never-route-up rule: if you
// deliberately put Ops on opus, that is your call, not a mistake to correct.

export type ProviderId = "anthropic" | "google" | "openai-compatible";

export interface AgentBrain {
  provider: ProviderId;
  model: string;
}

const OVERRIDE_KEY = "agent-hub:agent-brains";

const read = (): Record<string, AgentBrain> => {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Shape-check: a hand-edited or half-written value must not crash the app.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, AgentBrain> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const b = v as Partial<AgentBrain>;
      if (b && typeof b.provider === "string" && typeof b.model === "string" && b.model) {
        out[id] = { provider: b.provider as ProviderId, model: b.model };
      }
    }
    return out;
  } catch {
    return {};
  }
};

const write = (all: Record<string, AgentBrain>) => {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  } catch {
    /* private mode — overrides just don't persist */
  }
};

export const getOverrides = (): Record<string, AgentBrain> => read();

export const getOverride = (agentId: string): AgentBrain | null => read()[agentId] ?? null;

export const setOverride = (agentId: string, brain: AgentBrain) => {
  write({ ...read(), [agentId]: brain });
};

export const clearOverride = (agentId: string) => {
  const all = read();
  delete all[agentId];
  write(all);
};

export const clearAllOverrides = () => write({});

/**
 * The brain for an agent: an explicit override if one exists, otherwise the
 * preset the caller computed (tier routing on the operator's chosen model).
 */
export const brainFor = (agentId: string, fallback: AgentBrain): AgentBrain =>
  getOverride(agentId) ?? fallback;
