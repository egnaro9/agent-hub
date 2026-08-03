import type { Agent, Project, StructuralEdge } from "../types";

// Mock layer. These shapes are the STORE's contract, not the GitHub API's —
// a live feed still needs a mapping pass (layout coords, hue assignment,
// activity formatting) plus loading/error states in the store.

export const PROJECTS: Project[] = [
  { id: "model-drift", name: "model-drift", tagline: "16 LLMs watched daily for drift on a frozen suite", langs: ["Python", "Actions"], pos: { x: 120, y: 140 }, hue: "#2dd4bf", activity: ["cron: daily run green", "issue auto-filed on regression", "narrative rebuilt from run data"] },
  { id: "gradecore", name: "gradecore", tagline: "The shared grading engine — no LLM judges anywhere", langs: ["Python"], pos: { x: 300, y: 400 }, hue: "#22d3ee", activity: ["suite_hash byte-identical across repos", "sign-test refuses undecidable verdicts", "grounding_score shared with rag-eval-lab"] },
  { id: "crashkit", name: "crashkit", tagline: "Adversarial crash-tests, BYOK, deterministic graders", langs: ["Python", "React"], pos: { x: 120, y: 660 }, hue: "#fb7185", activity: ["fail cards caught the grader's own bug", "worst-case vs mean over N runs", "key never touches the server"] },
  { id: "rag-eval-lab", name: "rag-eval-lab", tagline: "RAG pipeline that catches planted hallucinations", langs: ["Python", "FastAPI"], pos: { x: 520, y: 540 }, hue: "#60a5fa", activity: ["BM25 matches SciFact baseline", "faithfulness delegates to gradecore", "CI posts runs to eval-history"] },
  { id: "eval-history", name: "eval-history", tagline: "Postgres memory for every eval run — what regressed?", langs: ["FastAPI", "Postgres"], pos: { x: 700, y: 760 }, hue: "#f472b6", activity: ["compare endpoint: 5 better, 1 worse → regressed", "CI on PG 16 + 18", "crash-test runs tagged source=crash_test"] },
  { id: "mcp-tools", name: "mcp-tools", tagline: "The eval stack, exposed to agents over MCP", langs: ["Python", "MCP"], pos: { x: 560, y: 120 }, hue: "#a78bfa", activity: ["calc / search / grade_answer / compare_runs", "AST-sandboxed evaluator", "wired into Claude Desktop"] },
  { id: "harness-builder", name: "harness-builder", tagline: "Draw a harness, sweep it, measure your assumption", langs: ["Python", "JS"], pos: { x: 1120, y: 660 }, hue: "#fbbf24", activity: ["more scaffolding scored worse, 22× cost", "refused to declare an unbacked winner", "188 tests"] },
  { id: "prompt-regress", name: "prompt-regress", tagline: "Merge gate that blocks eval regressions on PRs", langs: ["Python", "Actions"], pos: { x: 1290, y: 430 }, hue: "#34d399", activity: ["baseline vs branch comparison", "gates these very repos", "ships as a GitHub Action"] },
  { id: "pi-gates", name: "pi-gates", tagline: "Refusal gates for a second harness — fail closed", langs: ["TypeScript"], pos: { x: 1500, y: 250 }, hue: "#fb7185", activity: ["agent's own APPROVE resolves to null", "armed-banner or it isn't running", "source must be interactive"] },
  { id: "agentic-dev-harness", name: "agentic-dev-harness", tagline: "The five-stage loop that reviews itself", langs: ["Shell", "Hooks"], pos: { x: 1340, y: 90 }, hue: "#22d3ee", activity: ["Strategy→Execution→Critic→Eval→Ops", "cold critic in fresh context", "gates on every irreversible step"] },
  { id: "match3-engine", name: "match3-engine", tagline: "Property-pinned rules engine, Java → WASM", langs: ["Java", "TeaVM"], pos: { x: 1560, y: 560 }, hue: "#a78bfa", activity: ["16 jqwik invariants", "playable in-browser via TeaVM", "clean differential-testing target"] },
  { id: "tapdodge-engine", name: "tapdodge-engine", tagline: "One engine, two runtimes, diffed — the game on Play", langs: ["Java", "JS"], pos: { x: 1600, y: 800 }, hue: "#60a5fa", activity: ["69 differences from one seed, caught", "runsSinceInterstitial in the trace", "Playwright E2E, mutation-proven"] },
  { id: "evals-differential-oracle", name: "differential-oracle", tagline: "Write it twice; the disagreement names the liar", langs: ["Python"], pos: { x: 1180, y: 880 }, hue: "#2dd4bf", activity: ["5,000 boards, 0 disagreements", "planted bug: 2,624 caught by both nets", "seeded — a prediction, not a sample"] },
  { id: "agent-graph", name: "agent-graph", tagline: "LangGraph ReAct agent with guardrails that bite", langs: ["Python", "LangGraph"], pos: { x: 340, y: 900 }, hue: "#a78bfa", activity: ["AST-sandboxed calc tool", "step budget, tested", "runs as real LangGraph in your tab"] },
  { id: "llm-gateway", name: "llm-gateway", tagline: "Multi-provider gateway: auth, rate limits, caching, cost", langs: ["Python", "FastAPI"], pos: { x: 120, y: 880 }, hue: "#34d399", activity: ["per-key rate limiting", "per-model cost accounting", "flood it for a 429"] },
  { id: "eval-dashboard", name: "eval-dashboard", tagline: "Turns an eval run into metric cards; flags hallucinations", langs: ["Next.js", "TypeScript"], pos: { x: 760, y: 940 }, hue: "#60a5fa", activity: ["runtime schema validation", "29 tests", "static export"] },
  { id: "pi-eval", name: "pi-eval", tagline: "Deterministic grading as a pi package — no LLM judges", langs: ["TypeScript"], pos: { x: 1620, y: 400 }, hue: "#2dd4bf", activity: ["fixed predicates only", "gradecli holds zero grading logic, on purpose", "live + verified"] },
  { id: "cast-pipeline", name: "cast-pipeline", tagline: "Record a terminal demo once, fan it out to every surface", langs: ["Shell", "Python"], pos: { x: 960, y: 900 }, hue: "#fb7185", activity: ["asciinema → player/GIF/mp4", "every scene ends on a catch", "two-layer palette: vars + tokens"] },
];

export const AGENTS: Agent[] = [
  { id: "strat", name: "Strat", role: "Strategy — frames the arcs", color: "#a78bfa", glyph: "S", pos: { x: 840, y: 120 }, status: { kind: "idle" }, scope: "global" },
  { id: "forge", name: "Forge", role: "Execution — builds the thing", color: "#22d3ee", glyph: "F", pos: { x: 760, y: 420 }, status: { kind: "idle" }, scope: "global" },
  { id: "critic", name: "Critic", role: "Cold review — fresh context, no mercy", color: "#fb7185", glyph: "C", pos: { x: 1040, y: 260 }, status: { kind: "idle" }, scope: "global" },
  { id: "oracle", name: "Oracle", role: "Evaluation — runs the gates", color: "#2dd4bf", glyph: "O", pos: { x: 960, y: 560 }, status: { kind: "idle" }, scope: "global" },
  { id: "ops", name: "Ops", role: "Commit gate — guards the irreversible", color: "#fbbf24", glyph: "⌘", pos: { x: 1180, y: 100 }, status: { kind: "idle" }, scope: "global" },
  { id: "probe", name: "Probe", role: "Drift specialist — lives in model-drift", color: "#5eead4", glyph: "P", pos: { x: 320, y: 90 }, status: { kind: "idle" }, scope: { projectId: "model-drift" } },
  { id: "porter", name: "Porter", role: "Cross-runtime specialist — lives in tapdodge-engine", color: "#93c5fd", glyph: "⇄", pos: { x: 1440, y: 900 }, status: { kind: "idle" }, scope: { projectId: "tapdodge-engine" } },
];

export const STRUCTURAL: StructuralEdge[] = [
  { id: "s1", source: "gradecore", target: "crashkit", label: "grades" },
  { id: "s2", source: "gradecore", target: "model-drift", label: "same suite" },
  { id: "s3", source: "rag-eval-lab", target: "eval-history", label: "CI posts runs" },
  { id: "s4", source: "mcp-tools", target: "rag-eval-lab", label: "exposes" },
  { id: "s5", source: "prompt-regress", target: "eval-history", label: "baselines" },
  { id: "s6", source: "harness-builder", target: "gradecore", label: "scores via" },
  { id: "s7", source: "agentic-dev-harness", target: "pi-gates", label: "ported to" },
  { id: "s8", source: "match3-engine", target: "tapdodge-engine", label: "lineage" },
  { id: "s9", source: "evals-differential-oracle", target: "match3-engine", label: "technique" },
  { id: "s10", source: "agent-graph", target: "llm-gateway", label: "routes via" },
  { id: "s11", source: "agent-graph", target: "rag-eval-lab", label: "retrieves via" },
  { id: "s12", source: "rag-eval-lab", target: "eval-dashboard", label: "renders" },
  { id: "s13", source: "pi-eval", target: "pi-gates", label: "pi ecosystem" },
];

// Seed assignments so the hub is alive on first paint.
export const SEED_ASSIGNMENTS: Record<string, string> = {
  critic: "crashkit",
  forge: "tapdodge-engine",
};
