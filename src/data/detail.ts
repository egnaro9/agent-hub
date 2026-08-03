import type { ProjectDetail } from "../types";

// Per-project overview/work-mode content. All mock — shaped like what the
// GitHub API + a task backend would return.

const D = (metrics: [string, string][], tasks: [string, "done" | "doing" | "todo"][], files: [string, "file" | "pr", string][]): ProjectDetail => ({
  metrics: metrics.map(([label, value]) => ({ label, value })),
  tasks: tasks.map(([text, state], i) => ({ id: `t${i}`, text, state })),
  files: files.map(([name, kind, meta]) => ({ name, kind, meta })),
});

export const PROJECT_DETAIL: Record<string, ProjectDetail> = {
  crashkit: D(
    [["battery", "8 tasks · 7 kinds"], ["scoring", "worst-case over N"], ["keys stored", "0"]],
    [["Harden refusal-echo grader", "done"], ["Variance panel polish", "doing"], ["Mistral provider adapter", "todo"], ["Battery: tool-abuse deep set", "todo"]],
    [["fix: grader false-positive on refusal echo", "pr", "merged"], ["battery/adversarial.py", "file", "graders"], ["web/failcards.tsx", "file", "UI"]]
  ),
  "model-drift": D(
    [["models", "16 · 5 labs"], ["suite", "35 frozen tasks"], ["cadence", "daily cron"]],
    [["Publish minimum-detectable-regression", "todo"], ["Emit suite size into metrics.json", "todo"], ["Flip-analysis recording", "done"]],
    [["suite/frozen.json", "file", "fingerprinted"], ["probe alarm: flag harness-wide flips", "pr", "merged"]]
  ),
  gradecore: D(
    [["tests", "188"], ["repos sharing it", "3"], ["LLM judges", "0"]],
    [["Document the sign-test refusal", "done"], ["grounding_score edge cases", "doing"], ["Wire into second-brain eval", "todo"]],
    [["core/verdict.py", "file", "the verdict type"], ["shared grounder for rag-eval-lab", "pr", "merged"]]
  ),
  "tapdodge-engine": D(
    [["runtimes diffed", "2"], ["divergence caught", "69 diffs"], ["E2E", "10 · mutation-proven"]],
    [["Literal answer key in cadence test", "done"], ["runsSinceInterstitial into trace", "done"], ["Juice pass (TDR-JUICE-1)", "todo"]],
    [["matrix/run_matrix.sh", "file", "fault matrix"], ["e2e/tests/game.spec.mjs", "file", "Playwright"], ["F3 fixes + prediction", "pr", "merged"]]
  ),
  "rag-eval-lab": D(
    [["nDCG@10", "0.664"], ["planted lies caught", "every push"], ["runs in", "your tab"]],
    [["Reranker honesty note", "done"], ["Hybrid-retrieval sweep", "doing"], ["Corpus refresh", "todo"]],
    [["eval/faithfulness.py", "file", "→ gradecore"], ["CI: post runs to eval-history", "pr", "merged"]]
  ),
  "eval-history": D(
    [["stores", "every run"], ["verdicts", "won't bury a regression"], ["CI", "PG 16 + 18"]],
    [["Alembic drift test", "done"], ["/readyz probes", "done"], ["Retention policy", "todo"]],
    [["api/compare.py", "file", "the verdict"], ["observability pass", "pr", "merged"]]
  ),
  "harness-builder": D(
    [["sweep cost", "$0.99 · 20 tasks"], ["result", "more scaffolding scored worse"], ["honesty", "refuses undecidable"]],
    [["Field note: the sign test", "done"], ["Second suite: regression-capable", "todo"]],
    [["results/sweep_2026-07-25.json", "file", "raw"], ["assistant number-check predicate", "pr", "merged"]]
  ),
};

export const DEFAULT_DETAIL: ProjectDetail = D(
  [["status", "live"], ["feed", "mock"], ["wire-up", "pending"]],
  [["Wire real GitHub feed", "todo"], ["Define agent playbook", "todo"]],
  [["README.md", "file", "start here"]]
);

export const detailFor = (id: string): ProjectDetail => PROJECT_DETAIL[id] ?? DEFAULT_DETAIL;
