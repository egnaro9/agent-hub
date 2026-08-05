import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub, type RepoWork } from "../../state/hub";
import { useChrome, type ChromeKey } from "../../state/chrome";
import { detailFor } from "../../data/detail";
import ChatRoom from "./ChatRoom";
import TopologyBar from "../TopologyBar";

const HarnessWorld = lazy(() => import("./HarnessWorld"));
const ModelDriftWorld = lazy(() => import("./ModelDriftWorld"));
const CrashkitWorld = lazy(() => import("./CrashkitWorld"));
const DifferentialOracleWorld = lazy(() => import("./DifferentialOracleWorld"));
const TapdodgeWorld = lazy(() => import("./TapdodgeWorld"));
const EvalHistoryWorld = lazy(() => import("./EvalHistoryWorld"));
const HarnessLoopWorld = lazy(() => import("./HarnessLoopWorld"));
const PiGatesWorld = lazy(() => import("./PiGatesWorld"));
const GradecoreWorld = lazy(() => import("./GradecoreWorld"));
const RagEvalLabWorld = lazy(() => import("./RagEvalLabWorld"));
const Match3World = lazy(() => import("./Match3World"));
const AgentGraphWorld = lazy(() => import("./AgentGraphWorld"));
const LlmGatewayWorld = lazy(() => import("./LlmGatewayWorld"));
const EvalDashboardWorld = lazy(() => import("./EvalDashboardWorld"));
const McpToolsWorld = lazy(() => import("./McpToolsWorld"));
const PromptRegressWorld = lazy(() => import("./PromptRegressWorld"));
const PiEvalWorld = lazy(() => import("./PiEvalWorld"));
const CastPipelineWorld = lazy(() => import("./CastPipelineWorld"));

// Per-project overview worlds. A project without an entry gets the standard
// overview template; adding a world is one import + one line here.
const WORLDS: Record<string, React.ComponentType> = {
  "harness-builder": HarnessWorld,
  "model-drift": ModelDriftWorld,
  crashkit: CrashkitWorld,
  "evals-differential-oracle": DifferentialOracleWorld,
  "tapdodge-engine": TapdodgeWorld,
  "eval-history": EvalHistoryWorld,
  "agentic-dev-harness": HarnessLoopWorld,
  "pi-gates": PiGatesWorld,
  gradecore: GradecoreWorld,
  "rag-eval-lab": RagEvalLabWorld,
  "match3-engine": Match3World,
  "agent-graph": AgentGraphWorld,
  "llm-gateway": LlmGatewayWorld,
  "eval-dashboard": EvalDashboardWorld,
  "mcp-tools": McpToolsWorld,
  "prompt-regress": PromptRegressWorld,
  "pi-eval": PiEvalWorld,
  "cast-pipeline": CastPipelineWorld,
};

// ---- the WORK panel's two cards ---------------------------------------------
//
// These used to be two hardcoded lists labelled "mock" — sitting beside agents
// that were already reading the real repo, and rotted besides (model-drift
// still listed a shipped item as todo). Both now read the actual repo.
//
// The governing rule, everywhere below: never let one shape of nothing wear
// another's words. Loading is not empty, a spent rate limit is not an empty
// repo, and a project with no repo at all is not a failed request. Each gets
// its own sentence.

// One vocabulary for the ways a card can have nothing, so the two cards never
// describe the same outage differently.
const OUT_OF_BUDGET =
  "GitHub's hourly limit for this browser is spent — unauthenticated reads get 60 an hour, shared with the commit feed. Reload after the hour and it comes back.";
const NO_ANSWER =
  "GitHub didn't answer for this repo — it may be missing, renamed or private, or the network is down. That is not a claim there's nothing there.";
const NO_REPO =
  "This project was created here in the hub. There's no GitHub repo behind it yet, so there is nothing to read.";

const TONE = { live: "text-teal-300", warn: "text-amber-300", muted: "text-slate-500" } as const;

/** `label · source` — the source half is the card's claim about where its rows came from. */
function CardHead({ label, source, tone }: { label: string; source: string; tone: keyof typeof TONE }) {
  return (
    <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">
      {label} · <span className={TONE[tone]}>{source}</span>
    </div>
  );
}

/** Why this card is showing nothing, in words. An unexplained empty card is the thing being replaced. */
const Because = ({ text }: { text: string }) => (
  <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">{text}</p>
);

/** What the row cap withheld — so a card can't imply the repo is smaller than it is. */
const More = ({ n, label }: { n: number; label: string }) =>
  n > 0 ? <div className="mono mt-2.5 text-[10px] text-slate-600">+{n} more {label}</div> : null;

const WorkCard = ({ children }: { children: React.ReactNode }) => (
  <div className="glass min-h-0 flex-1 overflow-y-auto rounded-xl p-4">{children}</div>
);

/** A collapsible slot in the work column: open = the card with a corner
    chevron; folded = a thin labeled row. The preference is global chrome,
    not per-project — an operator who folds tasks folds them everywhere. */
function Slot({ label, k, open, children }: { label: string; k: ChromeKey; open: boolean; children: React.ReactNode }) {
  if (!open)
    return (
      <button
        aria-label={`Expand ${label}`}
        onClick={() => useChrome.getState().toggle(k)}
        className="glass mono flex w-full flex-none cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-left text-[9.5px] tracking-[0.25em] whitespace-nowrap text-slate-500 uppercase transition hover:text-slate-200"
      >
        <span className="text-slate-600">▸</span> {label}
      </button>
    );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {children}
      <button
        aria-label={`Collapse ${label}`}
        onClick={() => useChrome.getState().toggle(k)}
        className="mono absolute top-2.5 right-2.5 grid h-5 w-5 cursor-pointer place-items-center rounded text-[9px] text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
      >
        ▾
      </button>
    </div>
  );
}

// GitHub reports bytes; printing "48213" makes the reader do the division.
// Directories arrive unsized (the API doesn't count them), which is why null is
// a case here rather than a zero.
const fmtSize = (bytes: number | null): string => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
};

function FilesCard({ work, hue }: { work: RepoWork | undefined; hue: string }) {
  // `undefined` is "the fetch hasn't reported yet", same as "loading" — the
  // effect below fires it, and until it answers this card claims nothing.
  if (!work || work.phase === "loading")
    return (
      <WorkCard>
        <CardHead label="files" source="reading github…" tone="muted" />
      </WorkCard>
    );
  if (work.phase === "no-repo")
    return (
      <WorkCard>
        <CardHead label="files" source="no repo" tone="muted" />
        <Because text={NO_REPO} />
      </WorkCard>
    );
  const tree = work.tree;
  if (tree && tree.status === "ok")
    return (
      <WorkCard>
        <CardHead label="files" source="repo root · github" tone="live" />
        <ul className="mt-2.5 space-y-2">
          {tree.items.map((e) => (
            <li key={e.name} className="flex items-center gap-2.5 text-[11.5px] text-slate-300">
              {/* A directory reads differently from a file three ways over — the
                  badge is the project's hue rather than grey, the name carries a
                  trailing slash, and the size column is blank because GitHub
                  does not size a directory. */}
              <span
                className="mono flex-none rounded border px-1.5 py-px text-[8px] tracking-wider uppercase"
                style={
                  e.kind === "dir"
                    ? { borderColor: `${hue}66`, color: hue, background: `${hue}14` }
                    : { borderColor: "rgba(255,255,255,.15)", color: "#64748b" }
                }
              >
                {e.kind}
              </span>
              <span className={`mono min-w-0 flex-1 truncate ${e.kind === "dir" ? "text-slate-200" : ""}`}>
                {e.name}
                {e.kind === "dir" ? "/" : ""}
              </span>
              <span className="mono flex-none text-[9px] text-slate-600">{fmtSize(e.size)}</span>
            </li>
          ))}
        </ul>
        <More n={tree.more} label="in the repo root" />
      </WorkCard>
    );
  if (tree?.status === "empty")
    return (
      <WorkCard>
        {/* Still live: GitHub answered, and what it said was "nothing". */}
        <CardHead label="files" source="repo root · github" tone="live" />
        <Because text="GitHub answered and the repo root is genuinely empty — no files, no directories." />
      </WorkCard>
    );
  if (tree?.status === "rate-limited")
    return (
      <WorkCard>
        <CardHead label="files" source="rate limit" tone="warn" />
        <Because text={OUT_OF_BUDGET} />
      </WorkCard>
    );
  return (
    <WorkCard>
      <CardHead label="files" source="unavailable" tone="warn" />
      <Because text={NO_ANSWER} />
    </WorkCard>
  );
}

function TasksCard({ work, commits }: { work: RepoWork | undefined; commits: string[] | undefined }) {
  if (!work || work.phase === "loading")
    return (
      <WorkCard>
        <CardHead label="tasks" source="reading github…" tone="muted" />
      </WorkCard>
    );
  if (work.phase === "no-repo")
    return (
      <WorkCard>
        <CardHead label="tasks" source="no repo" tone="muted" />
        <Because text={NO_REPO} />
      </WorkCard>
    );

  const issues = work.issues;

  // FIRST CHOICE — open issues. On model-drift these are auto-filed drift
  // alerts rather than a hand-written to-do list, which is why the header says
  // "open issues" and not "tasks from the team": they ARE that repo's open
  // work, and the card names its source instead of characterising it.
  if (issues && issues.status === "ok")
    return (
      <WorkCard>
        <CardHead label="tasks" source="open issues · github" tone="live" />
        <ul className="mt-2.5 space-y-2">
          {issues.items.map((i) => (
            <li key={i.number} className="flex items-start gap-2.5 text-[12px] leading-snug text-slate-300">
              <span className="mono mt-px flex-none text-[10.5px] text-slate-600">#{i.number}</span>
              <span className="min-w-0 flex-1">{i.title}</span>
              {/* age is "" when GitHub gave no created_at — no bare separator */}
              {i.age && <span className="mono mt-px flex-none text-[9px] text-slate-600">{i.age}</span>}
            </li>
          ))}
        </ul>
        <More n={issues.more} label="open" />
      </WorkCard>
    );

  // SECOND CHOICE — what actually landed. Twelve of the thirteen repos on this
  // board have zero open issues, so an issues-only card would be dead almost
  // everywhere. These commits cost nothing extra: hydrateActivity already
  // pulled them for the overview's signals card.
  const why =
    issues?.status === "empty"
      ? "no open issues on this repo — showing what landed instead."
      : issues?.status === "rate-limited"
        ? "open issues unread, hourly limit spent — showing what landed instead."
        : "open issues unread, GitHub didn't answer — showing what landed instead.";
  if (commits && commits.length > 0)
    return (
      <WorkCard>
        <CardHead label="tasks" source="recent commits · github" tone="live" />
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{why}</p>
        <ul className="mt-2 space-y-2">
          {commits.map((c, i) => (
            <li key={i} className="mono flex gap-2.5 text-[11.5px] leading-relaxed text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-slate-500" />
              <span className="min-w-0 flex-1">{c}</span>
            </li>
          ))}
        </ul>
      </WorkCard>
    );

  // NEITHER — say which nothing this is.
  if (issues?.status === "rate-limited")
    return (
      <WorkCard>
        <CardHead label="tasks" source="rate limit" tone="warn" />
        <Because text={OUT_OF_BUDGET} />
      </WorkCard>
    );
  if (issues?.status === "empty")
    return (
      <WorkCard>
        <CardHead label="tasks" source="nothing to show" tone="muted" />
        <Because text="No open issues on this repo — and the commit read didn't answer, so there's no fallback to show either." />
      </WorkCard>
    );
  return (
    <WorkCard>
      <CardHead label="tasks" source="unavailable" tone="warn" />
      <Because text={NO_ANSWER} />
    </WorkCard>
  );
}

// REPO-OPS-1 — the gate loop's tail. An approved commit lands on a hub/*
// branch, Ops announces it once, and nothing ever said whether it became a PR
// or merged. This card answers that, for the room's own repo, visibility only.
// It renders NOTHING when the repo has no hub/* branches (most repos, most of
// the time — a permanent "no gate branches" card would be dead weight in a
// 240px column), and it stays quiet on fetch failures too unless commits are
// armed: the operator who armed the write path is the one who needs to know
// the loop can't currently report.
const PR_CHIP: Record<string, string> = {
  open: "text-cyan-200 border-cyan-300/40 bg-cyan-400/10",
  merged: "text-teal-200 border-teal-300/40 bg-teal-400/10",
  closed: "text-slate-400 border-white/15 bg-white/5",
  none: "text-amber-200 border-amber-300/40 bg-amber-400/10",
};

/** Whether GateOpsCard will render anything — its Slot must not float a
    collapse chevron over a card that declined to exist. */
const gateOpsVisible = (work: RepoWork | undefined, commitsArmed: boolean) => {
  const branches = work?.branches;
  if (!branches || branches.status === "empty") return false;
  return branches.status === "ok" || commitsArmed;
};

function GateOpsCard({ work }: { work: RepoWork | undefined }) {
  const commitsArmed = useHub((s) => s.commitsArmed);
  const branches = work?.branches;
  if (!gateOpsVisible(work, commitsArmed) || !branches) return null;
  if (branches.status !== "ok") {
    return (
      <WorkCard>
        <CardHead label="gate ops" source={branches.status === "rate-limited" ? "rate limit" : "unavailable"} tone="warn" />
        <Because
          text={
            branches.status === "rate-limited"
              ? OUT_OF_BUDGET
              : "GitHub didn't answer the branch read, so whether an approved commit became a PR is currently unknowable from here."
          }
        />
      </WorkCard>
    );
  }
  return (
    <WorkCard>
      <CardHead label="gate ops" source="hub/* branches · github" tone="live" />
      <ul className="mt-2.5 space-y-2" data-testid="gate-ops-list">
        {branches.items.map((b) => (
          <li key={b.name} className="flex items-center gap-2 text-[11px] leading-snug">
            <span className={`mono flex-none rounded border px-1.5 py-px text-[8.5px] tracking-wider uppercase ${PR_CHIP[b.prState]}`}>
              {b.prState === "none" ? "no PR" : b.prState}
            </span>
            <a
              href={b.prUrl || b.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mono min-w-0 flex-1 truncate text-[10.5px] text-slate-300 underline decoration-white/20 hover:decoration-cyan-200"
              title={b.prNumber ? `PR #${b.prNumber}` : "branch — open the PR in GitHub"}
            >
              {b.name.replace(/^hub\//, "")}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-600">
        Visibility only — merging stays in GitHub.
      </p>
    </WorkCard>
  );
}

// Every world composes at ONE canonical width and is scaled to fit whatever
// space it gets. That is the design decision, not a fallback: the dense,
// bunched composition you get in a half-width window is the intended look, so
// a full-screen monitor gets the same arrangement rendered larger — never the
// same panels sprayed to the corners. (It also fixes the tablet collisions the
// %-layout produced, since the layout never actually reflows.)
const WORLD_BASE_W = 1080;
const MAX_SCALE = 1.35; // beyond this the type reads as zoomed rather than grand
function WorldViewport({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = dims ? Math.min(MAX_SCALE, dims.w / WORLD_BASE_W) : 1;
  return (
    <div ref={ref} className="h-full min-h-0 overflow-hidden">
      {dims ? (
        <div
          style={{
            width: dims.w / scale,
            height: dims.h / scale,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function ProjectStage({ projectId }: { projectId: string }) {
  const project = useHub((s) => s.projects.find((p) => p.id === projectId));
  const projects = useHub((s) => s.projects);
  const structural = useHub((s) => s.structural);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const mode = useHub((s) => s.projectMode);
  const roomDrawer = useHub((s) => s.roomDrawer);
  const toggleRoomDrawer = useHub((s) => s.toggleRoomDrawer);
  const openStage = useHub((s) => s.openStage);
  const unassign = useHub((s) => s.unassign);
  const repoWork = useHub((s) => s.repoWork[projectId]);
  const commitsArmed = useHub((s) => s.commitsArmed);
  const wk = useChrome();
  const hydrateWork = useHub((s) => s.hydrateWork);

  // Fired HERE and only in work mode, not from openStage. These two requests
  // feed two cards that exist only in this tab, and openStage always lands in
  // overview — so hydrating on open spent 36 of a 60/hour budget rendering
  // nothing while an operator browsed the 18 worlds. The effect re-runs when the
  // segmented control flips, and hydrateWork is guarded per project per session,
  // so convene()'s straight-to-work path is covered by the same line.
  const exists = !!project;
  useEffect(() => {
    if (exists && mode === "work") void hydrateWork(projectId);
  }, [projectId, exists, mode, hydrateWork]);

  if (!project) return null;

  const detail = detailFor(projectId);
  const crew = agents.filter((a) => assignments[a.id] === projectId);
  const links = structural
    .filter((e) => e.source === projectId || e.target === projectId)
    .map((e) => ({
      label: e.label,
      other: projects.find((p) => p.id === (e.source === projectId ? e.target : e.source)),
      dir: e.source === projectId ? "→" : "←",
    }))
    .filter((l) => l.other);

  return (
    <motion.div
      key={projectId}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
      className="relative h-full min-h-0"
      style={{ background: `radial-gradient(900px 500px at 20% 0%, ${project.hue}14, transparent 60%)` }}
    >
      {mode === "overview" && WORLDS[projectId] ? (
        (() => {
          const World = WORLDS[projectId];
          return (
            <Suspense
              fallback={
                <div className="grid h-full place-items-center">
                  <span className="mono text-[11px] tracking-[0.25em] text-slate-500">entering world…</span>
                </div>
              }
            >
              <WorldViewport>
                <World />
              </WorldViewport>
            </Suspense>
          );
        })()
      ) : mode === "overview" ? (
        <div className="h-full min-h-0 overflow-y-auto p-5">
          {/* hero */}
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <div className="mono text-[9.5px] tracking-[0.3em] text-slate-500 uppercase">project</div>
              <h2 className="mono mt-1 text-[34px] leading-tight font-semibold tracking-tight text-slate-50" style={{ textShadow: `0 0 30px ${project.hue}77` }}>
                {project.name}
              </h2>
              <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-slate-400">{project.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.langs.map((l) => (
                  <span key={l} className="mono rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{l}</span>
                ))}
                <a
                  href={`https://github.com/egnaro9/${project.id}`}
                  target="_blank"
                  rel="noopener"
                  className="mono rounded border px-2 py-0.5 text-[10px] transition hover:brightness-125"
                  style={{ borderColor: `${project.hue}66`, color: project.hue, background: `${project.hue}14` }}
                >
                  github ↗
                </a>
              </div>
            </div>
            {/* crew */}
            <div className="flex flex-none flex-col items-end gap-2">
              <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">crew</div>
              {crew.length > 0 ? (
                <div className="flex -space-x-2">
                  {crew.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => unassign(a.id)}
                      title={`${a.name} — ${a.role} (click to release)`}
                      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[12px] font-bold text-white transition hover:scale-110"
                      style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}88, #0b1120 78%)`, border: `2px solid ${a.color}`, boxShadow: `0 0 14px ${a.color}44` }}
                    >
                      {a.glyph}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="mono text-[10px] text-slate-600">nobody on it — summon ↑</span>
              )}
            </div>
          </div>

          {/* metrics */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {detail.metrics.map((m) => (
              <div key={m.label} className="glass rounded-xl p-3.5" style={{ borderTop: `2px solid ${project.hue}` }}>
                <div className="mono text-[9px] tracking-[0.2em] text-slate-500 uppercase">{m.label}</div>
                <div className="mono mt-1 text-[15px] font-semibold text-slate-100">{m.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* signals — real commits once GitHub hydration lands, mock until */}
            <div className="glass rounded-xl p-4">
              <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">
                signals · {project.liveActivity ? <span className="text-teal-300">live · github</span> : "mock feed"}
              </div>
              <ul className="mt-2.5 space-y-2">
                {(project.liveActivity ?? project.activity).map((a, i) => (
                  <li key={i} className="mono flex gap-2.5 text-[11.5px] leading-relaxed text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: project.hue, boxShadow: `0 0 6px ${project.hue}` }} />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            {/* wired to */}
            <div className="glass rounded-xl p-4">
              <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">wired to</div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {links.length > 0 ? (
                  links.map((l, i) => (
                    <button
                      key={i}
                      onClick={() => openStage(l.other!.id)}
                      className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10.5px] text-slate-300 transition hover:border-white/30 hover:bg-white/10"
                    >
                      <span className="text-slate-600">{l.dir} {l.label} · </span>
                      <span style={{ color: l.other!.hue }}>{l.other!.name}</span>
                    </button>
                  ))
                ) : (
                  <span className="mono text-[10px] text-slate-600">stands alone</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* work mode — side column stacks above the room below lg (critic:
           tablet squeezed the chat to ~168px). Below sm the pair stacks
           vertically too: two cards sharing 390px meant ~170px each and
           mid-word truncation in the headers, so each card gets the full
           width and the pair splits the same height budget. */
        <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:flex-row">
          {/* fully folded, the side column also yields its width to the room */}
          <div className={`flex max-h-[240px] min-h-0 w-full flex-none flex-col gap-3 sm:max-h-[180px] sm:flex-row sm:gap-4 lg:max-h-none lg:flex-col ${wk.wkTasks || wk.wkFiles || wk.wkGate ? "lg:w-[300px]" : "lg:w-[150px]"}`}>
            <Slot label="tasks" k="wkTasks" open={wk.wkTasks}>
              <TasksCard work={repoWork} commits={project.liveActivity} />
            </Slot>
            <Slot label="files" k="wkFiles" open={wk.wkFiles}>
              <FilesCard work={repoWork} hue={project.hue} />
            </Slot>
            {gateOpsVisible(repoWork, commitsArmed) && (
              <Slot label="gate ops" k="wkGate" open={wk.wkGate}>
                <GateOpsCard work={repoWork} />
              </Slot>
            )}
          </div>
          {/* work mode gets the shape launcher over the room it runs in — the
              transcript and the composer below it are where the run lands. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {wk.wkTopology ? (
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TopologyBar projectId={projectId} />
                </div>
                <button
                  aria-label="Collapse topology"
                  onClick={() => useChrome.getState().toggle("wkTopology")}
                  className="mono mt-1 grid h-6 w-6 flex-none cursor-pointer place-items-center rounded text-[10px] text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
                >
                  ▴
                </button>
              </div>
            ) : (
              <button
                aria-label="Expand topology"
                onClick={() => useChrome.getState().toggle("wkTopology")}
                className="glass mono flex w-fit cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-left text-[9.5px] tracking-[0.25em] text-slate-500 uppercase transition hover:text-slate-200"
              >
                <span className="text-slate-600">▸</span> topology
              </button>
            )}
            <div className="min-h-0 flex-1">
              <ChatRoom projectId={projectId} />
            </div>
          </div>
        </div>
      )}

      {/* overview: collapsed room drawer on the right edge */}
      {mode === "overview" && (
        <>
          <button
            onClick={toggleRoomDrawer}
            className="mono absolute top-1/2 right-0 z-10 -translate-y-1/2 cursor-pointer rounded-l-lg border border-r-0 border-white/10 bg-[#0b1120]/90 px-1.5 py-4 text-[10px] tracking-[0.2em] text-slate-400 uppercase transition hover:text-cyan-200"
            style={{ writingMode: "vertical-rl" }}
          >
            {roomDrawer ? "close room" : `# ${project.name}`}
          </button>
          <AnimatePresence>
            {roomDrawer && (
              <motion.div
                initial={{ x: 440, opacity: 0.4 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 440, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="absolute top-3 right-6 bottom-3 z-10 w-[min(400px,85%)]"
              >
                <ChatRoom projectId={projectId} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
