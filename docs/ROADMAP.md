# Agent Hub — Roadmap

**The hub reads four ways, and every arc below serves at least one:** it is my daily
operator **instrument** (T1), a **research** rig where harness shape is a controlled
variable (T2), public **career** evidence for the AI Evaluation & Testing Engineer
positioning (T3), and a **product door** held open but not walked through (T4).

**Standing rule: the job-search queue outranks this file.** Every arc is sized for
part-time stretches and lands value alone; any arc can pause mid-track without leaving
a half-claim published.

**The one cross-track bet:** the loop-vs-pipeline context-visibility study. It needs the
instrument's exact spend accounting (T1), it *is* the flagship experiment (T2), its
writeup is the strongest interview artifact I can make (T3), and if it draws inbound,
that inbound is the only signal that opens the product door (T4).

Rules for arcs: each names what it builds on (file-level), a measurable exit, a size
guess, and a kill condition. No arc claims a capability the tree lacks.

---

## T1 — The Instrument

**Thesis.** Turn the hub from a demonstration of trust architecture into my daily
operator console: every gated action, tool call, and dollar of spend leaves a durable,
browsable record, and the field of view widens from one room's repo toward the 24-repo
operation — strictly within what a browser-only app can honestly do. An operator console
earns daily use by remembering and by closing loops, not by adding controls.

| Arc | Builds on | Exit | Size | Kill |
|---|---|---|---|---|
| **TOOL-TRACE-1** — visible tool calls, exact spend. Surface every free tool call as its own transcript row; replace the spend *range* with an exact model-call count via an onTurn/onTool callback out of the tool loop. | `src/agents/brain.ts` (`runToolLoop`, `streamAgentTurn`); `src/state/hub.ts` (`spendLine`, whose own comments admit two tool calls are indistinguishable from the store); `Message.action` in `src/types.ts`; llm-wire-stub for hermetic tests. | Spend note reads an exact count ("7 model calls"), never a range; each free tool call appears in the transcript; asserted in `brain.test.ts` plus one e2e against the wire stub. The "tool use may have taken it past the quote" hedge is deleted because it can no longer be true. | S | If exact counting requires restructuring the streaming paint path beyond ~a day, ship tool-call visibility only and keep the range — visibility is the operator value, exactness is polish. |
| **RUN-JOURNAL-1** — the persistent operator ledger. Append-only journal slice persisted separately from channels: one row per gate proposal/outcome, commit outcome (branch, URL), topology run (shape, quoted vs actual spend), commits-armed toggle. Browsable panel + JSON export. Today the only audit trail is chat truncated to 80 messages per channel — an approved gate card eventually falls off its own record. | `src/state/hub.ts` (persist/partialize truncation that motivates this; `approveAction` and the `note()` closure as emit points; `spendLine`); `commitToBranch`'s outcome in `src/agents/brain.ts`; `src/components/StoredData.tsx` as the pattern for a data-honest panel and where the journal must be disclosed as stored data. | Yesterday's approved commit is findable after reload — shape, quoted-vs-actual spend, branch URL — even after its chat scrolled past 80 messages. StoredData lists the journal with a working clear button. One e2e proves rows survive reload; the cross-tab stale-snapshot guard covers the journal too. | M | Cap rows (~500). If real use shows the cap can't hold a week of operating history, stop — don't build rotation infrastructure for a console not yet used daily. Depends softly on TOOL-TRACE-1 (rows record exact spend, not ranges). |
| **REPO-OPS-1** — close the gate loop. Not multi-repo *commits* (the gate stays room-scoped, branch-only) but visibility: a surface listing hub/* branches and open PRs across the egnaro9 repos. Today `commitToBranch` returns {branch, url}, Ops announces it once, and nothing ever reports whether it became a PR or merged. Authenticated reads via the existing scoped PAT when armed; unauthenticated fallback keeps the honest "rate-limited" vocabulary. Merging stays in GitHub — visibility, never action. | `src/agents/brain.ts` (`commitToBranch`, `gh()`, `getGhToken`); `src/data/github.ts` (`RepoFeed` status vocabulary, sessionStorage caching); the 18 projects in `src/data/mock.ts` as the repo-list seed. | After approving a proposal, its branch appears with PR state (none/open/merged/closed) and updates within one cache TTL of merging. Unauthenticated mode degrades to the named-budget sentence, never a spinner. No write endpoint beyond the existing gated propose_commit. | M | If the fine-grained PAT can't list across repos, or I decline using it for reads, cut to the room's own repo only — that alone closes the gate loop — and stop there. |
| **CAP-CATALOG-1** — the hub becomes the capability catalog. Render the harness capability registry as a hub surface, fed from a registry file committed to agentic-dev-harness (public), injected into agent system prompts the way live activity already is — so "what can the harness do about X" answers from the registry, not folklore. The hub cannot read local harness-system files; the registry export/IP-scrub is CLI-side work and lands first (registry already exists — revival, not build). | `readRepoFile` + the `src/data/github.ts` cache; `buildAgentSystem`'s live-context injection in `src/agents/brain.ts`; `src/components/stage/HarnessWorld.tsx` for the surface; `src/components/tutorial/entries.ts` for the audited-claim discipline. | Catalog panel renders live from the committed registry with cached fallback and honest failure states; an agent's answer to a capability question quotes registry entries; the tutorial claim about the catalog is audited against code like the rest. | M | If the registry's IP-scrub stalls, do NOT hand-curate a copy inside the hub — a fork of the registry is exactly the log-not-catalog failure again. Park the arc. External dependency: registry scrubbed into agentic-dev-harness first. |

**Sequencing.** TOOL-TRACE-1 first (small, and it makes spend honesty *exact* — the
property the whole console trades on), then RUN-JOURNAL-1 (the core T1 deliverable, and
the run-record substrate T2 wants), then REPO-OPS-1. CAP-CATALOG-1 is gated on the
CLI-side registry scrub — schedule that as its own small task before touching hub code.
A fifth arc (HARNESS-WATCH-1, a watch-only live-loop widget fed by a CLI-pushed status
file) was drafted and deferred: it only makes sense after the journal proves daily use,
and its hard rejection is recorded below. Cross-track: TOOL-TRACE-1's exact spend and
RUN-JOURNAL-1's run rows make the T2 study's same-price claims auditable and hand T3 two
more claims that survive audit.

---

## T2 — The Research Instrument

**Thesis.** `src/agents/topology.ts` already guarantees that `sequence` and `handoff`
run the same agents, in the same order, at the same price floor, differing ONLY in what
each node is shown — the code comments literally call it a controlled experiment. This
track turns that guarantee into published measurements, graded deterministically by
gradecore predicates (no LLM judges), in the house style where a null result is a
finding (prior art: harness-builder's published "more scaffolding scored worse,
95%→80%, and the suite said it cannot decide").

| Arc | Builds on | Exit | Size | Kill |
|---|---|---|---|---|
| **RUN-EXPORT-1** — a finished run becomes a gradable artifact, with its conditions pinned. Export a completed run as one JSON file: shape + stages, task, every node's message with its node stamp, quoted floor, measured spend, model id, timestamps, per-link hand provenance (the `hand` variable in `runTopology` already tracks it). Add per-run config overrides (model, temperature, max_tokens — `brain.ts` hardcodes `max_tokens: 1024`, a confound: chain artifacts silently truncate and a late link inherits the damage), and the config block travels in the export so every artifact names its own conditions. No seeding claim — the API gives none; repeats + paired stats are the determinism story. | Message node stamps + spend tally in `src/state/hub.ts` (`runTopology`, `leftBy`, `spendLine`); `src/agents/brain.ts` request construction (two `max_tokens` call sites); `src/components/StoredData.tsx` privacy-view pattern; the launcher's quoted-vs-planned mismatch guard as the "run must match what was displayed" precedent. | A handoff run and a sequence run each download as JSON, and a 20-line Python script using gradecore can grade every link of both without touching the app. Two runs at different max_tokens produce exports whose config blocks differ and whose transcripts show the truncation difference. Schema documented in-repo. | S | If the export needs new bookkeeping inside `runTopology` (the transcript doesn't already contain everything), stop and fix the transcript's honesty first — an export that records more than the room shows the operator violates the trust architecture. If config plumbing touches the gate/tool path, drop the UI half and ship a dev-only constant block — the study needs the pin, not the panel. |
| **BATCH-RUNNER-1** — N repeats without N clicks. Playwright-driven batch harness reusing the e2e infrastructure with the stub OFF and a real key: T tasks × R reps × S shapes sequentially through the real `runTopology` path — the same code path an operator's click takes, so the study measures the instrument as shipped. Hard spend ceiling computed from floors and printed BEFORE the first call; one export artifact per run into `runs/`. Fresh state per task (pi-eval's sweep discipline). | `e2e/playwright.config.ts` + `e2e/tests/helpers.ts` + `e2e/tests/anthropic-stub.ts` (proof the wire boundary intercepts cleanly); `runTopology`'s single-run lock (batch is sequential by construction); `~/pi-eval` `tools/sweep.mjs` as the design precedent. | One command runs a 5-task × 3-rep × 2-shape smoke sweep (30 runs) on a cheap model, writes 30 valid artifacts, total spend lands inside the printed floor-to-ceiling band. Flake rate under 10%. | M | If browser-driving flakes above 10% or ~400 runs exceed one overnight, PIVOT to a headless Node runner importing `topology.ts` + `brain.ts` directly (plain TS). KILL entirely if identical inputs produce structurally different recorded requests — a nondeterministic instrument makes no study on top of it honest. Depends on RUN-EXPORT-1. |
| **STUDY-CONTEXT-VIS-1** — the flagship: loop vs pipeline, same everything, differing only in what each node sees. Tasks seeded from pi-eval's mined pools, reframed so a 4-link chain has real per-link work (extract → transform → verify → finalize); final link graded by the task's gradecore predicate; discriminators MINED not authored (pilot both shapes, keep tasks where they ever disagree). NOISE FLOOR FIRST: sequence-vs-sequence across reps before any cross-shape claim. Target ~40 tasks × 5 reps × 2 shapes × 4 links ≈ 1600 calls floor on a Haiku-class model; sign test / paired permutation; "cannot decide" is a valid, reportable verdict. Measured: pass rate per shape, rep variance, actual spend vs floor (the "same price" claim is itself a tested hypothesis). One model, one vendor, temperature pinned. Publishable either way — a sequence win quantifies topology.ts's own conjecture that a full transcript lets a late agent silently repair upstream loss; a null pairs with the published scaffolding null. The writeup (FINDINGS.md style in-repo, then dev.to, with runs/ + grading script committed) is part of this arc's exit, not a separate arc. | `src/agents/topology.ts` (sequence/handoff semantics, head flag, `briefFor`'s no-back-channel wording); `src/state/hub.ts` (hand/floor mechanics, `emptyHandoff` explicit-empties); `~/gradecore` predicates + paired stats that refuse underpowered verdicts; `~/pi-eval` suites and FINDINGS.md conventions; `e2e/tests/topology-handoff.spec.ts` as proof the visibility contract is enforced at the wire. | A written result stating effect direction with p-value OR "the suite cannot decide at this N" — with runs/, the grading script, and the noise-floor measurement committed so the claim survives the portfolio-claims audit; then live on dev.to with cover image, every number tracing to a run artifact on disk. | L | TASK-DESIGN kill: if after a 2-session timebox the chain reframing stays degenerate (middle links near-copying), stop and write up WHY single-artifact tasks resist pipelining — short, honest, still publishable. POWER kill: if the noise floor equals cross-shape disagreement AND power math demands >5000 calls, publish the pilot as "this suite cannot separate these shapes at affordable N" and let the follow-ons die with it. Depends on BATCH-RUNNER-1. |
| **DRIFT-METRIC-1** — telephone drift, measured per station. From the study's artifacts, grade EVERY link (not just the last) with the task predicate, plus secondary signals the briefs already forbid: question-displacement, artifact-length decay, task-restatement leakage. Then surface it in the hub: a per-link pass/fail strip on completed handoff runs, so the operator sees where the artifact died. Handoff transcripts are the only place drift is visible at all — topology.ts documents that a sequence lets late agents silently repair loss. | Every link already writes its full artifact into the transcript with a node stamp; `leftBy()` + `emptyHandoff` events are already drift events; gradecore per-link grading over RUN-EXPORT-1 artifacts. | Drift curve per task (grade vs link position) and a first-failure-position distribution, reproducible by script; in-hub, any completed handoff run shows its per-link strip. Metric defined in writing BEFORE the corpus is graded — no post-hoc metric shopping. | M | Dies with STUDY-1's task-design kill. Independently: kill the in-hub strip (keep the offline metric) if it requires the hub to hold grading predicates — grading logic stays out of the app, same discipline as gradecli holding zero grading logic. |

**Sequencing.** Strict order: RUN-EXPORT-1 → BATCH-RUNNER-1 → STUDY-CONTEXT-VIS-1
(noise-floor pilot runs FIRST as its internal gate) → DRIFT-METRIC-1. Two follow-on
studies were drafted and are deliberately NOT committed arcs: SHAPE-SWEEP-1 (scoreboard
across all four presets + composed shapes) and JUDGE-ROI-1 (what a verdict-plus-revision
round buys per extra call — the round-aware briefs in `briefFor` are already engineered
for it). Both are gated on STUDY-1's power result: if two maximally-different shapes
can't be separated, four can't, and a judge-round effect won't clear a noise floor that
swamps shape effects. They get promoted to arcs only if STUDY-1 resolves. Honesty
constraints baked in: the hub today has NO export, NO batch mode, NO seeding, and
hardcoded max_tokens — no arc claims otherwise; grading logic never enters the app;
every published claim ships with its runs/ directory. Flagship spend bounded at ~1600
Haiku-class calls plus pilot, ceiling printed before the first call.

---

## T3 — Career Capital

**Thesis.** Convert hub work into public, disk-auditable evidence for the AI Evaluation
& Testing Engineer positioning — without ever naming this repo. The pattern that already
works (harness-builder's honest negative result, the agentic-dev-harness IP-scrub, the
llm-wire-stub extraction): do real work, extract the publishable residue, audit every
claim against disk before it ships. This track productizes the residue; it never invents
work for the sake of a post.

| Arc | Builds on | Exit | Size | Kill |
|---|---|---|---|---|
| **ONEPAGER-1** — interview one-pager, claims disk-verified. One page mapping public artifacts to eval-engineer competencies: deterministic grading (gradecore/pi-eval), hermetic testing (llm-wire-stub), honest negative results (harness-builder), gate/trust design, controlled experiments. Each bullet carries a clickable link and a claim that survives the audit. Living document, updated as arcs ship. Never names this repo — "a private multi-agent ops project" where needed. | The portfolio truth-gate discipline (`tools/refresh_drift.py` + the claim-audit workflow); the positioning pivot; crashkit, harness-builder, agentic-dev-harness, llm-wire-stub as existing anchors. | One page exists, every claim passes disk verification on the day it's sent, and it has been attached to or referenced in at least one real application or interview. | S | If the positioning pivots away from evals, rewrite rather than patch. No other kill — this directly serves the queue that outranks hub work and may jump any ordering at will. |
| **STUB-SHIP-1** — llm-wire-stub npm publish + dev.to post. Publish at 0.1.0, then the post: a scripted Anthropic API at the network boundary — real SDK, real SSE decode, real tool loop; only the bytes are scripted. Angle: hermetic e2e testing of LLM apps without an LLM judge. Claims audited against the repo before publish; the post may say "extracted from a private multi-agent project", never the name. | `~/llm-wire-stub` is extracted and public with a publish-ready package.json (v0.1.0, MIT, prepack build, files whitelist); `npm view llm-wire-stub` 404s, so the name is free and the publish is genuinely not done; this repo's e2e suite is the living consumer that proves the API surface. | Package resolvable on npm; the stub's e2e (or this repo) consumes the published version; post live with cover image; every claim in post + README passes the disk-verification gate. | S | If prepping the publish reveals the extraction still reaches into hub internals, or the API surface is churning (breaking change needed within the first week of dogfooding), stabilize in-repo and retry later — don't publish a package I'd immediately break. |
| **TRUST-CASE-1** — the trust-architecture case study; explicit decision NOT to flip the repo public. Dev.to case study: gate design, spend honesty, announced-vs-gated actions, adversarial claims-audit of my own tutorial. Screenshots re-shot with scrubbed names. The weighing, done honestly: a public flip would be stronger evidence (runnable > described) but costs a full claims audit across the entire README/tutorial/test surface (the claim-rot audit found 19 problems in 56 claims on a smaller estate), exposes key-custody and PAT-scoping code before it has hardened, and forecloses the T4 private-product option. Decision: case study now; flip only on the T4 signal. The ideas are the career capital, not the source. | The three-tier gate (`src/agents/brain.ts` + the operator-click commit gate), price floor + actual-spend report (`src/agents/topology.ts`, `src/agents/customShapes.ts`), the audited tutorial (`src/components/tutorial/entries.ts`), `src/components/StoredData.tsx` — all shipped and tested (164 unit + 45 e2e). Precedent: the agentic-dev-harness IP-scrub playbook, already executed once. | Post published with cover image; zero occurrences of the repo name, URL, or identifying visuals; every technical claim traced to a file or test before publish; the flip decision recorded so it isn't relitigated from scratch. | M | If scrubbing hollows the post so far that claims become unverifiable-by-construction (all assertion, nothing a reader could check), stop — wait for the T2 study to give it a public evidence anchor, or fold the material into the study writeup instead of shipping a weak standalone. Best after STUB-SHIP-1 (the stub is the public, checkable companion artifact). |
| **CAST-EMBED-1** — demo casts for the two fresh publics. Two short casts in the house style (each ends on a failure being CAUGHT — that IS the eval-engineer pitch): the stub catching a deliberate script-mismatch, and if TRUST-CASE-1 ships, a scrubbed gate-refusal moment. Embedded in the stub README + posts. Closes the standing gap: the existing GIFs are embedded nowhere. | `~/cast-pipeline` is built, public, proven (record.sh, export.sh, scenes/ — 8 prior casts). Hub-adjacent casts pass the same scrub bar as TRUST-CASE-1: no repo name, no identifying UI. | llm-wire-stub README and post each embed a working cast; the cast shows a failure caught, not a happy path; scrub verified frame-by-frame before upload. | S | One session per cast, hard cap — the pipeline exists precisely so this is cheap; if a scene fights back longer, ship the post without it. If the case-study cast can't be scrubbed convincingly, cut that cast, keep the stub cast. Depends on STUB-SHIP-1. |

**Sequencing.** ONEPAGER-1 v1 can ship today from existing artifacts and may jump any
queue — it serves the job search directly. Then STUB-SHIP-1 (one evening), then
TRUST-CASE-1 with CAST-EMBED-1 riding alongside. The study writeup is NOT a separate
arc here — it lives inside STUDY-CONTEXT-VIS-1's exit, because a writeup arc for a study
that hasn't run is exactly the kind of open loop this roadmap exists to prevent.
Standing publish rules on every arc: claims verified against disk pre-publish, cover
image per post, this repo never named.

---

## T4 — The Product Door (open, not a commitment)

**Thesis.** Buy cheap optionality on "the ops room where agents can't lie to you"
without committing to a product. The differentiator, if one ever exists, is trust
architecture — key custody, gate design, spend honesty — not orchestration. Every arc
is a timeboxed spike or a document; nothing here ships a feature, and nothing beyond
these arcs gets built until a logged external signal fires.

| Arc | Builds on | Exit | Size | Kill |
|---|---|---|---|---|
| **SIGNALS-LEDGER-1** — the events that would open the door, decided in advance. `docs/product-signals.md` pre-commits the criteria so a flattering moment can't be retro-fitted into justification. Per signal: trigger, evidence bar, FIRST paid-for slice, review date. Seeds: (1) someone asks to run THEIR repos in the hub; (2) an employer wants it internal (named team + use case); (3) a study post drives ≥N distinct askers for the TOOL rather than the writeup. Carries the NOT-NOW list with reasons. | The strategic frame's T4 trigger; `README.md` as the surface signals arrive through; THREAT-MODEL-1's cost summary prices signal 2; DESKTOP-SPIKE-1's report prices signal 1. | Ledger exists with ≥3 signals, each with all four fields, plus the NOT-NOW list with one-line reasons. Linked from this roadmap. Reviewed in one sentence per review date. | S | The ledger's own rule is the kill: two consecutive review dates with zero signals fired → the track goes dormant and no T4 arc may be proposed until a logged signal fires with evidence. Any future arc arriving without a ledger entry naming its signal is dead on arrival. |
| **THREAT-MODEL-1** — multi-user threat-model doc. What does the trust architecture mean when the operator is not the only human? Enumerate assets (per-vendor keys, write-scoped PAT, transcripts, `agent-hub:state`), trust boundaries as they exist (unlisted URL is not auth; localStorage is per-browser-profile, not per-human; the three-tier gate assumes the clicker is the key owner), abuse cases per scenario (second human at the machine, shared instance, hosted multi-tenant). Each gap gets a verdict: acceptable-solo / blocks-any-second-user / requires-desktop-key-custody. Doubles as honest T3 material — gate design + threat modeling IS the eval-engineer discipline. | `src/components/StoredData.tsx` (already names the real gap: two live credentials in localStorage); `src/components/MissionControl.tsx` (PAT scoping + branch-only commit gate); `src/agents/providers.ts` (key-custody discipline); `src/data/github.ts` (budget + token paths); the three-tier gate in the agents layer. | `docs/threat-model.md` exists; every gate and credential path cites the file that implements it (spot-checkable against the tree); every gap carries a verdict; ends with a one-paragraph "what multi-user minimally requires" that the ledger can price against. No code changes. | S | Kill the moment it starts prescribing implementations (an auth design, a sync protocol) — it is a map, not a backlog. One doc, one revision pass. A finding that demands an immediate solo-operator fix spawns a T1 arc, not more threat-model text. |
| **DESKTOP-SPIKE-1** — Tauri shell spike, disposable branch. Wrap the Vite build in Tauri and test exactly two claims the browser build cannot: (1) key custody can move from localStorage to the OS keychain — `providers.ts` wraps every key touch, so the spike swaps the storage backend behind that seam, not the callers; (2) OpenAI-direct becomes possible — `vendors.ts` marks it `browserBlocked` ("wait for the desktop build"); a native HTTP bridge is not subject to api.openai.com's missing CORS headers. Deliverable: a written report of what broke (CSP, PAT path, e2e wiring, packaging) — not a maintained desktop app. | `src/agents/vendors.ts` (`browserBlocked` + the openai entry); `src/agents/providers.ts` (the swap seam); `src/components/MissionControl.tsx` (PAT storage that would also move); `vite.config.ts` (the build Tauri wraps); the memory finding that no key fixes api.openai.com from a browser. | A throwaway branch where the hub boots in a Tauri window and completes ONE real OpenAI-direct call with the vendor key absent from localStorage (verified via StoredData showing no key while the call succeeds), plus a spike report in docs/ with an honest desktop-build cost estimate. Branch abandoned, not merged. | M | Timebox: no booting shell after 2 part-time sessions → stop and write the report on why; that finding is still the deliverable. Also kill if the keychain swap requires rewriting `brain.ts`/`providers.ts` callers instead of swapping behind the wrapper — that means the seam is a lie, which is itself the answer ("desktop costs a refactor, not a spike"). |

**Sequencing.** Within hub work T4 is last: T1/T2 produce daily value and study
material; T4 produces only optionality. Order: SIGNALS-LEDGER-1 first (makes the track
self-policing), THREAT-MODEL-1 second (worth having regardless), DESKTOP-SPIKE-1 only
on a trigger — a ledger signal fires, or a T2 cross-vendor study is actually blocked by
`browserBlocked` OpenAI-direct. Those are the only two real reasons to run it.

---

## Next five arcs (across tracks, in order)

1. **ONEPAGER-1** (T3, S) — it serves the job-search queue directly, ships today from
   artifacts that already exist, and everything else strengthens it as it lands.
2. **STUB-SHIP-1** (T3, S) — one evening; the npm name is free, the package is
   publish-ready, and it gives the case study its public, checkable companion.
3. **TOOL-TRACE-1** (T1, S) — small, and it makes spend honesty *exact*, the property
   every other claim in this roadmap trades on.
4. **RUN-JOURNAL-1** (T1, M) — the core instrument deliverable, and the run-record
   substrate the research track will want before it exists.
5. **RUN-EXPORT-1** (T2, S) — the seam between the hub and gradecore; the moment a
   finished run is a gradable file, the flagship study stops being hypothetical.

After these: REPO-OPS-1, then BATCH-RUNNER-1 → STUDY-CONTEXT-VIS-1, with TRUST-CASE-1 +
CAST-EMBED-1 slotting into whatever part-time stretch they fit.

## Deliberately not doing

- **Launching or controlling a CLI session from the browser.** The hub cannot spawn,
  signal, or attach to a process, and a local bridge server would break browser-only
  architecture and the key-custody posture. The most a future arc may do is *watch* — a
  CLI-pushed status file polled via `readRepoFile` (the deferred HARNESS-WATCH-1) —
  and only after RUN-JOURNAL-1 proves daily use. Approval stays on the CLI's own gates.
- **Flipping this repo public.** Settled inside TRUST-CASE-1: runnable would be stronger
  evidence, but it costs a full claims audit, exposes unhardened key-custody code, and
  forecloses T4. Revisit only on a logged ledger signal.
- **Auth, sync, teams/multi-tenant, billing.** No second user exists; auth without a
  threat model is theater; sync is a solution shopping for a problem; multi-tenancy
  multiplies the threat model before any signal has fired; there is nothing to bill for
  until an actual asker names a first slice. All four live in the signals ledger with
  reasons, so the refusal is a written decision, not an omission.
- **Multi-repo commits.** The gate stays room-scoped and branch-only. REPO-OPS-1 widens
  *visibility* to the fleet; merging happens in GitHub.
- **Hand-curating a copy of the harness capability registry inside the hub.** A fork of
  the registry is exactly the log-not-catalog failure again. If the scrub stalls,
  CAP-CATALOG-1 parks.
- **Real-repo GitHub-panel questions as flagship study tasks.** Not deterministically
  gradable; deferred to follow-on qualitative work.
- **SHAPE-SWEEP-1 and JUDGE-ROI-1 as committed arcs.** Both are follow-ons gated on the
  flagship's power result — if two maximally-different shapes can't be separated, four
  can't.
- **A methods-only post about a study that hasn't run.** The study writeup is part of
  STUDY-CONTEXT-VIS-1's exit, not a standalone arc.
- **Grading logic inside the app.** Grading stays in gradecore scripts over exported
  artifacts, same discipline as gradecli holding zero grading logic.
- **Cross-vendor comparison in the flagship.** One model, one vendor, temperature
  pinned. Cross-vendor is a separate question — and the only study-shaped reason to run
  DESKTOP-SPIKE-1 early.
