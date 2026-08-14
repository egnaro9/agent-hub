# IP-scrub report — agent-hub

**Date:** 2026-08-14. **Scope:** every finding from the pre-scrub audit of this
repo, classified blocker / genericize / fine, with the fix applied in place or
the residual named. This report is the artifact the public-flip decision reads.
**This scrub does not change the repo's status: it is private and stays private.
Flipping it public is a separate human decision, out of scope here.**

The doctrine applied: genericize private repo/engine names (a scrubbed
reference keeps its meaning without naming the private artifact), keep the
genre public, remove absolute paths and secrets outright, protect the
identity seam.

---

## Fixed in place

### 1. `docs/ROADMAP.md` — named the private harness repo (BLOCKER)
The CAP-CATALOG-1 arc said "The hub cannot read local harness-system files."
**Fix:** now reads "the dev harness's private workspace files" — same meaning,
no private name. `git grep harness-system` over the tree: zero hits.
**Residual (history):** the name exists in ~20 historical commits of this
file. A public flip therefore requires a history squash/rewrite or a fresh
single-commit export — a HEAD edit alone is not sufficient. Decision needed
at flip time, not before.

### 2. `worlds_shoot.mjs` — absolute path leaking the macOS username (BLOCKER)
The screenshot path hard-coded a `/private/tmp/claude-501/-Users-lonimua/…`
scratchpad location — linking the public dev identity to the personal
identity the doctrine protects, plus an agent-session directory layout.
**Fix:** screenshots now write to a repo-relative `shots/` directory
(created on run, gitignored). Tree scan for `lonimua`, `/Users/`,
`/private/tmp`: zero hits.
**Residual (history):** the path is in prior commits — same flip-time
history treatment as finding 1.

### 3. `docs/ROADMAP.md` — personal filesystem path (part of BLOCKER 3)
ONEPAGER-1 named `~/Desktop/Resume/ONE_PAGER.md`. **Fix:** replaced with
"the one-pager lives outside this repo." The `~/pi-eval`, `~/gradecore`,
`~/cast-pipeline`, `~/llm-wire-stub` references remain: they name public
repos, carry no username, and read as generic checkout locations.

### 4. `test-results/.last-run.json` — accidentally tracked run-state (fine)
**Fix:** untracked; `test-results` and `shots` added to `.gitignore`.
Content was harmless (status: passed, no paths) — hygiene only.

---

## Verified clean (no change needed)

### 5. Secrets — tree and history
Re-verified this pass, matching the audit: all key material in src/, e2e/,
and docs/ is fake test constants (`sk-ant-test…`, `github_pat_test…`) or
placeholders; history grep for real `sk-ant-` / `ghp_` / `github_pat_`
token shapes: zero hits. `render.yaml` is a static-site build with no
secrets. `.gitignore` already excluded `dist`, `*.local`,
`e2e/run-artifacts`.

### 6. Private-name sweep — the game lineage and the identity seam
Zero occurrences in tree or history of the private game repo, its
predecessor lineage, the private role names, or personal emails. The
match-3 engine appears only as its public standalone repo
(`match3-engine`) with no harness linkage edge — the sever doctrine holds;
its only structural edge is the public `match3-engine → tapdodge-engine`
lineage. Harness doctrine phrases in the agent personas mirror the
already-public `agentic-dev-harness`, not private internals.

### 7. "Erik's Agent Hub" branding and operator-register comments (fine)
Erik's name is already public on the portfolio; the branding stays by
doctrine. The operator-note register in comments ("pending Erik's go",
"Erik's call") reads as internal notes if published — cosmetic at most;
left as-is. Flag it only if the flip-time read decides the register
matters.

### 8. Watermark scan
`wmscan` run over the README, ROADMAP, seed data, and all five new world
scenes: CLEAN. `--selftest` passed the same session, so the clean verdict
is meaningful.

---

## Residuals that need Erik's judgment (all flip-time decisions)

### R1. `docs/ROADMAP.md` as a whole — the strategy document (BLOCKER for a flip)
Beyond the two fixed lines, the file *is* the private playbook:
job-search-queue-outranks framing, interview positioning, the
never-name-this-repo publishing rule, product-door option calculus, and
operator notes. Nothing credential-class, but publishing it hands over the
exact strategy the T3 track says to keep private.
**Recommendation:** on any flip, exclude `docs/ROADMAP.md` from the public
tree (the cheap path — the history rewrite that findings 1–2 already
require makes exclusion nearly free). Heavy genericization is the
alternative, and it would hollow the document.

### R2. `docs/drafts/TRUST_CASE_POST.md` + `TRUST_CASE_NOTES.md`
The draft's premise is "a private multi-agent ops console… never names the
repo." Committing it inside that repo means a public flip retroactively
de-anonymizes the published post and exposes the publish-gating strategy.
**Recommendation:** drop `docs/drafts/` from any public tree, same
mechanism as R1. No in-place edit can fix a premise.

### R3. `README.md` live URL + Render service slug
The README names `agent-hub-exiz.onrender.com` as "unlisted and
un-indexed." A public repo makes that false by definition and invites
strangers into the operator console (BYOK-only, no server secrets — a
posture change, not a leak).
**Recommendation:** on flip, rewrite that sentence and consider re-slugging
the Render service. Nothing to do while private.

### R4. Git history
Findings 1 and 2 (and R1/R2's files) live in history. Any flip needs a
squashed export or history rewrite; a fresh-history public mirror is the
simplest honest shape. Recorded here so the flip decision starts from the
right cost.

---

## Scan appendix (all run at this commit)

- `git grep harness-system` → 0
- `git grep -E "lonimua|/Users/|/private/tmp|Desktop/Resume"` → 0
- token-shape grep (tree + history), test/placeholder constants excluded → 0
- private-name sweep (game lineage, role names, personal domains, emails) → 0
- `wmscan` over new/edited prose-bearing files → CLEAN (selftest PASS)
