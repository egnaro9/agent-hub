import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub, agentInScope } from "../state/hub";

// The thin command strip over the stage: where you are, who's active, summon.
export default function MissionControl() {
  const stage = useHub((s) => s.stage);
  const projects = useHub((s) => s.projects);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const projectMode = useHub((s) => s.projectMode);
  const setProjectMode = useHub((s) => s.setProjectMode);
  const backToGraph = useHub((s) => s.backToGraph);
  const summon = useHub((s) => s.summon);
  const [summonOpen, setSummonOpen] = useState(false);

  const project = stage.kind === "project" ? projects.find((p) => p.id === stage.id) : undefined;
  const active = agents.filter((a) => a.status.kind === "working" || a.status.kind === "talking").length;
  const errored = agents.filter((a) => a.status.kind === "error").length;
  const summonable = project
    ? agents.filter((a) => agentInScope(a, project.id) && assignments[a.id] !== project.id)
    : [];

  return (
    <div className="relative z-30 flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/8 bg-[#070b17]/90 px-4 py-1 backdrop-blur">
      {/* location */}
      <button onClick={backToGraph} className={`mono cursor-pointer text-[11px] transition ${project ? "text-slate-500 hover:text-slate-300" : "text-slate-200"}`}>
        constellation
      </button>
      {project && (
        <>
          <span className="mono text-[11px] text-slate-700">/</span>
          <span className="mono flex items-center gap-1.5 text-[11px] text-slate-100">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.hue, boxShadow: `0 0 6px ${project.hue}` }} />
            {project.name}
          </span>
          <div className="ml-2 flex overflow-hidden rounded-md border border-white/10">
            {(["overview", "work"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setProjectMode(m)}
                className={`mono cursor-pointer px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
                  projectMode === m ? "bg-cyan-400/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* fleet status */}
      <span className="mono hidden text-[10px] text-slate-400 lg:inline">
        <span className="text-teal-300">{active}</span> active
        {errored > 0 && (
          <>
            {" · "}
            <span className="text-rose-400">{errored} error</span>
          </>
        )}
        {" · "}
        {agents.length} agents
      </span>

      {/* summon */}
      <div className="relative">
        <button
          onClick={() => setSummonOpen((v) => !v)}
          disabled={!project || summonable.length === 0}
          className="mono cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-400/25 disabled:cursor-default disabled:border-white/10 disabled:text-slate-600 disabled:hover:bg-transparent"
          title={project ? "Summon an agent onto this project" : "Select a project first"}
        >
          + summon agent
        </button>
        <AnimatePresence>
          {summonOpen && project && summonable.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="glass absolute top-9 right-0 w-52 overflow-hidden rounded-xl p-1"
            >
              {summonable.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    summon(a.id, project.id);
                    setSummonOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/8"
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] text-slate-200">{a.name}</span>
                    <span className="mono block truncate text-[8.5px] text-slate-400">{a.role}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* global search hint — focuses the sidebar search */}
      <button
        onClick={() => document.getElementById("hub-search")?.focus()}
        className="mono hidden cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-500 transition hover:text-slate-300 lg:block"
      >
        search <span className="text-slate-700">/</span>
      </button>
    </div>
  );
}
