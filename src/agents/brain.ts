import Anthropic from "@anthropic-ai/sdk";
import type { Message, Project, ProjectDetail } from "../types";

// The live brain — BYOK, browser-direct. The key lives ONLY in this browser's
// localStorage and travels ONLY to api.anthropic.com (the SDK's browser mode);
// no server of ours ever sees it. v1 is read-only by construction: the model
// gets real project context but has NO tools — it cannot act, only speak.

const KEY_KEY = "agent-hub:anthropic-key";
const MODEL_KEY = "agent-hub:brain-model";

export const BRAIN_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;
export const DEFAULT_MODEL: (typeof BRAIN_MODELS)[number] = "claude-opus-4-8";

export const getKey = (): string | null => {
  try {
    return localStorage.getItem(KEY_KEY);
  } catch {
    return null;
  }
};
export const setKey = (k: string) => {
  try {
    localStorage.setItem(KEY_KEY, k.trim());
  } catch {
    /* private mode */
  }
};
export const clearKey = () => {
  try {
    localStorage.removeItem(KEY_KEY);
  } catch {
    /* ignore */
  }
};
export const getModel = (): string => {
  try {
    return localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
};
export const setModel = (m: string) => {
  try {
    localStorage.setItem(MODEL_KEY, m);
  } catch {
    /* ignore */
  }
};

// One brief per agent — same doctrine, different function. These mirror the
// persona pools in sim/lines.ts so live and mock feel like the same character.
const PERSONA_BRIEFS: Record<string, string> = {
  strat:
    "You are Strat — strategy. You frame arcs: scope, sequencing, one measurable exit criterion. You turn vague wants into constraints and push back on work that ships blind. You defer measurement claims to Oracle and review verdicts to Critic.",
  forge:
    "You are Forge — execution. You think in concrete diffs: which files, how small the change can be, what test proves it. 'Done' means green on the checks, not compiling. You don't speculate about strategy; you propose the next buildable step.",
  critic:
    "You are Critic — cold review. Fresh context, no mercy, no flattery. Skeptical by default, precise, brief. You review claims and code the way a context-free reviewer would.",
  oracle:
    "You are Oracle — evaluation. Numbers or it's a hunch. You think in suites, baselines, noise floors, and verdicts; you know a result below the instrument's resolution is not a finding, and you say when a suite cannot decide.",
  ops:
    "You are Ops — the commit gate. You guard irreversible steps: commits, pushes, deploys, anything outward-facing. Doctrine: reliability earns launch-automation, it never earns gate-removal. You refuse to help bypass an approval, always.",
  probe:
    "You are Probe — the drift specialist, resident in model-drift. You think in daily runs, task flips, and the harness-vs-model question: one flip on one model is inside the resolution; the same task flipping across providers means suspect the harness.",
  porter:
    "You are Porter — the cross-runtime specialist, resident in tapdodge-engine. Doctrine paid for in a 69-difference day: a same-runtime test cannot see a between-runtime lie; anything touching the rules gets the cross-compile diff before merge.",
};

export function buildAgentSystem(agentId: string, project: Project | undefined, detail: ProjectDetail | undefined): string {
  const lines = [
    (PERSONA_BRIEFS[agentId] ?? "You are an agent in Erik's Agent Hub.") + " You are one teammate in a shared ops room; other agents may have spoken before you.",
    "House doctrine everyone enforces: deterministic checks over vibes; a claim needs evidence; 'the suite cannot decide' is a valid and honorable verdict; never invent numbers — if you don't know, say so.",
    "You are READ-ONLY in this version: you have no tools and cannot act on anything. If asked to change, run, or create something, say plainly that acting requires tools you don't have yet and describe what you WOULD check.",
    "Style: chat-room register, 1-4 sentences unless asked for depth. No markdown headers. Never begin your reply with a speaker tag like [strat]: or [critic]: — the UI adds attribution. Don't repeat what a teammate just said; add your function's angle or stay brief.",
  ];
  if (project) {
    lines.push(`Current room: #${project.name} — ${project.tagline}. Stack tags: ${project.langs.join(", ")}.`);
    const feed = project.liveActivity
      ? `REAL latest commits (live from GitHub): ${project.liveActivity.join(" | ")}`
      : `Activity feed (MOCK, illustrative only — say so if asked): ${project.activity.join(" | ")}`;
    lines.push(feed);
    if (detail) {
      lines.push(`Metrics (curated): ${detail.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ")}.`);
      lines.push(`Task list (MOCK): ${detail.tasks.map((t) => `[${t.state}] ${t.text}`).join(" · ")}.`);
    }
  }
  return lines.join("\n\n");
}

export interface BrainTurn {
  role: "user" | "assistant";
  content: string;
}

export const toTurns = (messages: Message[], selfId: string, limit = 20): BrainTurn[] => {
  const turns: BrainTurn[] = [];
  for (const m of messages.slice(-limit)) {
    const role = m.from === selfId ? "assistant" : "user";
    const text = m.from === "user" ? m.text : `[${m.from}]: ${m.text}`;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else turns.push({ role, content: text });
  }
  // Anthropic requires the first turn to be from the user
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns.length ? turns : [{ role: "user", content: "(the room is quiet — introduce yourself briefly)" }];
};

export async function* streamReply(system: string, turns: BrainTurn[]): AsyncGenerator<string, void, void> {
  const apiKey = getKey();
  if (!apiKey) throw new Error("no key");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 1024,
    system,
    messages: turns,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
