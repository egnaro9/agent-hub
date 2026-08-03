import type { ProjectDetail } from "../types";

// ILLUSTRATIVE MOCK — rendered under explicit "mock" labels in the UI.
// Rules (cold-critic enforced): no invented PRs, no "merged" badges, no file
// paths that don't exist in the real repos. File rows are either verified real
// paths or README.md. Numbers must match the published record.

const D = (metrics: [string, string][], tasks: [string, "done" | "doing" | "todo"][]): ProjectDetail => ({
  metrics: metrics.map(([label, value]) => ({ label, value })),
  tasks: tasks.map(([text, state], i) => ({ id: `t${i}`, text, state })),
});

export const PROJECT_DETAIL: Record<string, ProjectDetail> = {
  crashkit: D(
    [["battery", "8 tasks · 7 kinds"], ["scoring", "worst-case over N"], ["keys stored", "0"]],
    [["Harden refusal-echo grader", "done"], ["Variance panel polish", "doing"], ["Battery: tool-abuse deep set", "todo"]]
  ),
  "model-drift": D(
    [["models", "16 · 5 labs"], ["suite", "35 frozen tasks"], ["cadence", "daily cron"]],
    [["Publish minimum-detectable-regression", "todo"], ["Emit suite size into metrics.json", "todo"], ["Flip-analysis recording", "done"]]
  ),
  gradecore: D(
    [["tests", "84"], ["repos sharing it", "4"], ["LLM judges", "0"]],
    [["Document the sign-test refusal", "done"], ["grounding_score edge cases", "doing"]]
  ),
  "tapdodge-engine": D(
    [["runtimes diffed", "2"], ["divergence caught", "69 diffs"], ["E2E", "10 · mutation-proven"]],
    [["Literal answer key in cadence test", "done"], ["runsSinceInterstitial into trace", "done"], ["Juice pass (TDR-JUICE-1)", "todo"]]
  ),
  "rag-eval-lab": D(
    [["nDCG@10", "0.664"], ["planted lies caught", "every push"], ["runs in", "your tab"]],
    [["Reranker honesty note", "done"], ["Hybrid-retrieval sweep", "doing"], ["Corpus refresh", "todo"]]
  ),
  "eval-history": D(
    [["stores", "every run"], ["verdicts", "won't bury a regression"], ["CI", "PG 16 + 18"]],
    [["Alembic drift test", "done"], ["/readyz probes", "done"], ["Retention policy", "todo"]]
  ),
  "harness-builder": D(
    [["sweep cost", "$0.99 · 20 tasks"], ["result", "more scaffolding scored worse"], ["honesty", "refuses undecidable"]],
    [["Field note: the sign test", "done"], ["Second suite: regression-capable", "todo"]]
  ),
};

export const DEFAULT_DETAIL: ProjectDetail = D(
  [["status", "live"], ["feed", "mock"], ["wire-up", "pending"]],
  [["Wire real GitHub feed", "todo"], ["Define agent playbook", "todo"]]
);

export const detailFor = (id: string): ProjectDetail => PROJECT_DETAIL[id] ?? DEFAULT_DETAIL;
