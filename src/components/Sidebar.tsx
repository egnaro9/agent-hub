import { useHub, agentInScope } from "../state/hub";
import type { Agent } from "../types";

const statusText = (a: Agent, projectName?: string) =>
  a.status.kind === "idle"
    ? "idle"
    : a.status.kind === "thinking"
      ? a.status.note
      : a.status.kind === "talking"
        ? "in session"
        : a.status.kind === "error"
          ? a.status.note
          : `on ${projectName ?? "…"}`;

const dotColor = (a: Agent) =>
  a.status.kind === "idle"
    ? "#64748b"
    : a.status.kind === "error"
      ? "#fb7185"
      : a.status.kind === "working"
        ? a.color
        : "#e2e8f0";

export default function Sidebar() {
  const projects = useHub((s) => s.projects);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const stage = useHub((s) => s.stage);
  const starred = useHub((s) => s.starred);
  const search = useHub((s) => s.search);
  const setSearch = useHub((s) => s.setSearch);
  const toggleStar = useHub((s) => s.toggleStar);
  const openStage = useHub((s) => s.openStage);
  const backToGraph = useHub((s) => s.backToGraph);
  const openChat = useHub((s) => s.openChat);

  const q = search.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);

  const visible = projects.filter((p) => match(p.name));
  const pinned = visible.filter((p) => starred.includes(p.id));
  const rest = visible.filter((p) => !starred.includes(p.id));

  const currentProjectId = stage.kind === "project" ? stage.id : null;
  const visibleAgents = agents.filter(
    (a) => match(a.name) && (a.scope === "global" || a.scope.projectId === currentProjectId)
  );

  const projectRow = (p: (typeof projects)[number]) => {
    const active = currentProjectId === p.id;
    const crew = agents.filter((a) => assignments[a.id] === p.id);
    const isStarred = starred.includes(p.id);
    return (
      <div
        key={p.id}
        className={`group flex w-full items-center gap-2.5 px-4 py-[7px] transition ${active ? "bg-white/8" : "hover:bg-white/4"}`}
        style={active ? { boxShadow: `inset 2px 0 0 ${p.hue}` } : undefined}
      >
        <button onClick={() => openStage(p.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: p.hue, boxShadow: `0 0 6px ${p.hue}` }} />
          <span className={`mono flex-1 truncate text-[11.5px] ${active ? "text-slate-100" : "text-slate-400 group-hover:text-slate-200"}`}>
            {p.name}
          </span>
          {crew.length > 0 && (
            <span className="flex -space-x-1">
              {crew.map((a) => (
                <span key={a.id} className="grid h-3.5 w-3.5 place-items-center rounded-full text-[7px] font-bold text-white" style={{ background: a.color, border: "1px solid #070b17" }}>
                  {a.glyph}
                </span>
              ))}
            </span>
          )}
        </button>
        <button
          onClick={() => toggleStar(p.id)}
          title={isStarred ? "unpin" : "pin"}
          className={`mono cursor-pointer text-[11px] transition ${
            isStarred ? "text-amber-300" : "text-slate-700 opacity-0 group-hover:opacity-100 hover:text-amber-300"
          }`}
        >
          {isStarred ? "★" : "☆"}
        </button>
      </div>
    );
  };

  return (
    <aside className="flex h-screen w-[252px] shrink-0 flex-col border-r border-white/8 bg-[#070b17]">
      {/* brand */}
      <button onClick={backToGraph} className="cursor-pointer border-b border-white/8 p-4 pb-3 text-left transition hover:bg-white/4">
        <div className="mono text-[9px] tracking-[0.3em] text-cyan-300/70 uppercase">seraphlight // ops</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tracking-tight text-slate-100">Agent Hub</span>
          <span className="mono text-[9px] text-slate-600">v0.3 · mock</span>
        </div>
      </button>

      {/* search */}
      <div className="border-b border-white/8 p-3">
        <input
          id="hub-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          placeholder="search projects & agents…"
          className="mono w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none transition focus:border-cyan-300/50"
        />
      </div>

      {/* projects */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {pinned.length > 0 && (
          <>
            <div className="mono px-4 pb-1 text-[9.5px] tracking-[0.25em] text-amber-300/70 uppercase">pinned</div>
            {pinned.map(projectRow)}
            <div className="mx-4 my-2 border-t border-white/6" />
          </>
        )}
        <div className="mono px-4 pb-2 text-[9.5px] tracking-[0.25em] text-slate-400 uppercase">
          projects <span className="text-slate-700">· {visible.length}</span>
        </div>
        {rest.map(projectRow)}
        {visible.length === 0 && <div className="mono px-4 py-2 text-[10px] text-slate-500">nothing matches "{search}"</div>}
      </div>

      {/* agents */}
      <div className="border-t border-white/8 py-3">
        <div className="mono px-4 pb-2 text-[9.5px] tracking-[0.25em] text-slate-400 uppercase">
          agents <span className="text-slate-700">· {visibleAgents.length}</span>
        </div>
        {visibleAgents.map((a) => {
          const pid = assignments[a.id];
          const projectName = pid ? projects.find((p) => p.id === pid)?.name : undefined;
          const scoped = a.scope !== "global";
          return (
            <button
              key={a.id}
              onClick={() => openChat(a.id)}
              className="group flex w-full cursor-pointer items-center gap-2.5 px-4 py-[7px] text-left transition hover:bg-white/4"
              title={a.role}
            >
              <span className="relative flex-none">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}77, #0b1120 75%)`, border: `1.5px solid ${a.color}` }}
                >
                  {a.glyph}
                </span>
                <span
                  className={`absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-[#070b17] ${
                    a.status.kind === "thinking" || a.status.kind === "talking" || a.status.kind === "error" ? "breathe" : ""
                  }`}
                  style={{ background: dotColor(a) }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12px] text-slate-200">
                  {a.name}
                  {scoped && <span className="mono rounded border border-white/10 px-1 text-[7.5px] tracking-wider text-slate-400 uppercase">scoped</span>}
                </span>
                <span className={`mono block truncate text-[9px] ${a.status.kind === "error" ? "text-rose-400" : "text-slate-400"}`}>
                  {statusText(a, projectName)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
