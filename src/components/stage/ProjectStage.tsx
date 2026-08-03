import { Suspense, lazy } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub } from "../../state/hub";
import { detailFor } from "../../data/detail";
import ChatRoom from "./ChatRoom";

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

const stateGlyph = { done: "✓", doing: "◐", todo: "○" } as const;
const stateColor = { done: "#2dd4bf", doing: "#fbbf24", todo: "#64748b" } as const;

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
              <World />
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

          <div className="mt-5 grid grid-cols-2 gap-4">
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
        /* work mode */
        <div className="flex h-full min-h-0 gap-4 p-4">
          <div className="flex min-h-0 w-[300px] flex-none flex-col gap-4">
            <div className="glass min-h-0 flex-1 overflow-y-auto rounded-xl p-4">
              <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">tasks · mock</div>
              <ul className="mt-2.5 space-y-2">
                {detail.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5 text-[12px] leading-snug text-slate-300">
                    <span className="mono mt-px flex-none text-[12px]" style={{ color: stateColor[t.state] }}>{stateGlyph[t.state]}</span>
                    <span className={t.state === "done" ? "text-slate-500 line-through decoration-white/20" : ""}>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass min-h-0 flex-1 overflow-y-auto rounded-xl p-4">
              <div className="mono text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">files · mock</div>
              <ul className="mt-2.5 space-y-2">
                {detail.files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[11.5px] text-slate-300">
                    <span
                      className="mono flex-none rounded border px-1.5 py-px text-[8px] tracking-wider uppercase"
                      style={f.kind === "pr" ? { borderColor: "#a78bfa66", color: "#a78bfa" } : { borderColor: "rgba(255,255,255,.15)", color: "#64748b" }}
                    >
                      {f.kind}
                    </span>
                    <span className="mono min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="mono flex-none text-[9px] text-slate-600">{f.meta}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <ChatRoom projectId={projectId} />
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
                className="absolute top-3 right-6 bottom-3 z-10 w-[400px]"
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
