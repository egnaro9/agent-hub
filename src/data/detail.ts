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
    [["models", "16 · 5 labs"], ["suite", "35 frozen tasks"], ["noise floor", "measured, 3 same-day runs"]],
    [["Measure the floor under the drift signal", "done"], ["VAC bundle: board recomputed offline", "done"], ["Flip-analysis recording", "done"]]
  ),
  gradecore: D(
    [["tests", "84"], ["evalmut's verdict on it", "3 holes, fairly classed"], ["LLM judges", "0"]],
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
  // ── the verifiable-evaluation region ────────────────────────────────────
  evalmut: D(
    [["operators", "18 · mined, cited"], ["dogfood", "3 holes in its own dependency"], ["LLM judges", "0"]],
    [["8 adversarial cold-critique rounds", "done"], ["Launch: dev.to + LinkedIn", "done"], ["Operator backlog triage", "todo"]]
  ),
  "reference-fleet": D(
    [["members", "6 + 1 native"], ["board protocol", "paired · exact rates"], ["naive suite caught", "1 of 6"]],
    [["Audit board, CI-reproduced", "done"], ["Native defect measured (LoRA)", "done"], ["Fleet v2 expansion", "todo"]]
  ),
  "agent-certlab": D(
    [["contracts", "7 · all regraded in CI"], ["task families", "3"], ["calibration agents", "3, separated by policy"]],
    [["Machine family: coordinated seeds", "done"], ["Cloud certification in Actions", "done"], ["Gate on own contract (vac-gate)", "done"]]
  ),
  "vac-protocol": D(
    [["registry", "11 accepted · 0 pending"], ["tamper fixtures", "15, all refused"], ["evidence profiles", "5"]],
    [["Fifth profile: the drift board", "done"], ["Independent replay workflow", "done"], ["External replay requests", "todo"]]
  ),
  "vac-gate": D(
    [["failure reasons", "17 · named"], ["tests", "16 · gate run as subprocess"], ["regrade scope", "certlab-bundle-v1"]],
    [["Liveness test per refusal", "done"], ["Dogfood workflow in the lab", "done"], ["Freshness policy (v2)", "todo"]]
  ),
};

export const DEFAULT_DETAIL: ProjectDetail = D(
  [["status", "live"], ["feed", "mock"], ["wire-up", "pending"]],
  [["Wire real GitHub feed", "todo"], ["Define agent playbook", "todo"]]
);

export const detailFor = (id: string): ProjectDetail => PROJECT_DETAIL[id] ?? DEFAULT_DETAIL;
