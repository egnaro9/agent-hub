import type { Agent, Project, StructuralEdge } from "../types";

// Mock layer. These shapes are the STORE's contract, not the GitHub API's —
// a live feed still needs a mapping pass (layout coords, hue assignment,
// activity formatting) plus loading/error states in the store.

export const PROJECTS: Project[] = [
  { id: "model-drift", name: "model-drift", tagline: "16 LLMs watched daily for drift on a frozen suite", langs: ["Python", "Actions"], pos: { x: 120, y: 140 }, hue: "#2dd4bf", activity: ["cron: daily run green", "issue auto-filed on regression", "single flips sit inside the instrument's resolution"] },
  { id: "gradecore", name: "gradecore", tagline: "The shared grading engine — no LLM judges anywhere", langs: ["Python"], pos: { x: 300, y: 400 }, hue: "#22d3ee", activity: ["suite_hash byte-identical across repos", "sign-test refuses undecidable verdicts", "grounding_score shared with rag-eval-lab"] },
  { id: "crashkit", name: "crashkit", tagline: "Adversarial crash-tests, BYOK, deterministic graders", langs: ["Python", "React"], pos: { x: 120, y: 660 }, hue: "#fb7185", activity: ["fail cards caught the grader's own bug", "worst-case vs mean over N runs", "key never touches the server"] },
  { id: "rag-eval-lab", name: "rag-eval-lab", tagline: "RAG pipeline that catches planted hallucinations", langs: ["Python", "FastAPI"], pos: { x: 520, y: 540 }, hue: "#60a5fa", activity: ["BM25 matches SciFact baseline", "faithfulness delegates to gradecore", "CI posts runs to eval-history"] },
  { id: "eval-history", name: "eval-history", tagline: "Postgres memory for every eval run — what regressed?", langs: ["FastAPI", "Postgres"], pos: { x: 700, y: 760 }, hue: "#f472b6", activity: ["compare endpoint: 5 better, 1 worse → regressed", "CI on PG 16 + 18", "crash-test runs tagged source=crash_test"] },
  { id: "mcp-tools", name: "mcp-tools", tagline: "The eval stack, exposed to agents over MCP", langs: ["Python", "MCP"], pos: { x: 560, y: 120 }, hue: "#a78bfa", activity: ["calc / search / grade_answer / compare_runs + a board reader", "AST-sandboxed evaluator", "wireable into Claude Desktop"] },
  { id: "harness-builder", name: "harness-builder", tagline: "Draw a harness, sweep it, measure your assumption", langs: ["Python", "JS"], pos: { x: 1120, y: 660 }, hue: "#fbbf24", activity: ["more scaffolding scored worse, 22× cost", "refused to declare an unbacked winner", "17 of 20 tasks tied; p<0.05 unreachable"] },
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
  // ── the verifiable-evaluation region (suite era, 2026-08) ──────────────────
  { id: "evalmut", name: "evalmut", tagline: "Mutation testing for eval suites — does your check check anything?", langs: ["Python"], pos: { x: 2250, y: 500 }, hue: "#a3e635", activity: ["18 mined operators, each names a real origin", "found 3 holes in its own dependency's graders", "tool-fault false positives at zero since round six"] },
  { id: "reference-fleet", name: "reference-fleet", tagline: "Models broken one documented way each — to measure the benchmark", langs: ["Python"], pos: { x: 2350, y: 320 }, hue: "#f97316", activity: ["6 members, defects mined from real incidents", "audit board: the naive suite caught 1 of 6", "native LoRA: mixture 0.507 in, 0.200 out greedy"] },
  { id: "agent-certlab", name: "agent-certlab", tagline: "Capability contracts for coding agents, evidence attached", langs: ["Python", "Actions"], pos: { x: 2100, y: 180 }, hue: "#38bdf8", activity: ["7 contracts committed — every verdict regraded in CI", "one run certified entirely inside Actions", "null 0/6 · oracle 6/6 · test-deleter 0/6, by policy"] },
  { id: "vac-protocol", name: "vac-protocol", tagline: "Verifiable Agent Claims — do not trust us, run it", langs: ["Python", "Actions"], pos: { x: 1900, y: 300 }, hue: "#eab308", activity: ["registry: 11 accepted entries, zero pending", "15 tampered fixtures, every one refused", "prints on every run: structural PASS is not a replay"] },
  { id: "vac-gate", name: "vac-gate", tagline: "No verified capability contract, no green check", langs: ["Python", "Actions"], pos: { x: 2000, y: 560 }, hue: "#f43f5e", activity: ["17 named failure reasons, each proven to fire", "regrade-unsupported fails loud, never skips silent", "the contract issuer gates on its own contract"] },
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
  // The verifiable-evaluation region: vac-protocol is the trust layer over
  // five live issuers (its five evidence profiles, verbatim), vac-gate holds
  // CI to it. Program chain: evalmut → reference-fleet → agent-certlab.
  { id: "s14", source: "evalmut", target: "gradecore", label: "built on" },
  { id: "s15", source: "reference-fleet", target: "evalmut", label: "answer key for" },
  { id: "s16", source: "agent-certlab", target: "reference-fleet", label: "same discipline" },
  { id: "s17", source: "vac-protocol", target: "agent-certlab", label: "evidence profile" },
  { id: "s18", source: "vac-protocol", target: "reference-fleet", label: "evidence profile" },
  { id: "s19", source: "vac-protocol", target: "evalmut", label: "evidence profile" },
  { id: "s20", source: "vac-protocol", target: "crashkit", label: "evidence profile" },
  { id: "s21", source: "vac-protocol", target: "model-drift", label: "evidence profile" },
  { id: "s22", source: "vac-gate", target: "vac-protocol", label: "verifies with" },
  { id: "s23", source: "vac-gate", target: "agent-certlab", label: "dogfooded by" },
];

// Seed assignments so the hub is alive on first paint.
export const SEED_ASSIGNMENTS: Record<string, string> = {
  critic: "crashkit",
  forge: "tapdodge-engine",
};
