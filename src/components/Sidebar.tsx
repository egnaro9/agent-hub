import { useHub, agentInScope } from "../state/hub";
import { useChrome } from "../state/chrome";
import { SUN, WORMHOLES, wormholeTarget } from "./constellation";
import type { Agent } from "../types";

// The constellation is an enhancement, never the only path: every portal the
// map draws as a wormhole is also a plain link here, with the same estate
// rule (same tab inside egnaro9.github.io, new tab external). The registry —
// the map's sun — leads the list.
const PORTALS = [
  { id: SUN.id, name: SUN.name, claim: "the live evidence registry — do not trust us, run it", url: SUN.url, hue: "#eab308" },
  ...WORMHOLES,
  // the way home: every estate page points back to the hub, the galaxy included
  { id: "hub", name: "portfolio hub", claim: "the whole estate, one page", url: "https://egnaro9.github.io/", hue: "#94a3b8" },
];

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

// `onNavigate` exists for the phone drawer: picking a destination should close
// the drawer over you, so every navigation (brand, project, agent) reports
// itself. Pinning is not navigation — the star keeps the drawer open. The
// static desktop rail passes nothing and behaves exactly as before.
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const sbHeader = useChrome((s) => s.sbHeader);
  const sbProjects = useChrome((s) => s.sbProjects);
  const sbAgents = useChrome((s) => s.sbAgents);
  const toggleChrome = useChrome((s) => s.toggle);
  const projects = useHub((s) => s.projects);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const stage = useHub((s) => s.stage);
  const starred = useHub((s) => s.starred);
  const search = useHub((s) => s.search);
  const setSearch = useHub((s) => s.setSearch);
  const toggleStar = useHub((s) => s.toggleStar);
  const openStage = useHub((s) => s.openStage);
  const requestPlanet = useHub((s) => s.requestPlanet);
  const stageKind = useHub((s) => s.stage.kind);
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
        <button
          onClick={() => {
            // On the galaxy the row raises the planet's arrival card (and a
            // second click on the same row lowers it); inside a project it
            // stays a direct stage switch.
            if (stageKind === "graph") requestPlanet(p.id);
            else openStage(p.id);
            onNavigate?.();
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
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
          aria-label={isStarred ? `unpin ${p.name}` : `pin ${p.name}`}
          aria-pressed={isStarred}
          className={`mono flex-none cursor-pointer rounded text-[11px] transition outline-none focus-visible:ring-1 focus-visible:ring-amber-300/70 ${
            isStarred
              ? "text-amber-300"
              : "text-slate-600 opacity-50 group-hover:opacity-100 hover:text-amber-300 focus-visible:opacity-100"
          }`}
        >
          {isStarred ? "★" : "☆"}
        </button>
      </div>
    );
  };

  // Fully folded, the rail also yields its WIDTH — three thin rows do not
  // justify 252px while the galaxy could be using it.
  const railSlim = !sbHeader && !sbProjects && !sbAgents;
  return (
    <aside className={`flex h-screen shrink-0 flex-col border-r border-white/8 bg-[#070b17] transition-[width] duration-300 ${railSlim ? "w-[168px]" : "w-[252px]"}`}>
      {/* brand — collapsible; the whole-rail collapse lives here too (desktop
          only: in the phone drawer the drawer itself is the collapse) */}
      <div className="relative border-b border-white/8">
        {sbHeader ? (
          <button
            onClick={() => {
              backToGraph();
              onNavigate?.();
            }}
            className="w-full cursor-pointer p-4 pb-3 text-left transition hover:bg-white/4"
          >
            <div className="mono text-[9px] tracking-[0.3em] text-cyan-300/70 uppercase">erik hill // command</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-[17px] font-semibold tracking-tight text-slate-100">Agent Hub</span>
              <span className="mono text-[9px] text-slate-600">v0.3</span>
            </div>
          </button>
        ) : (
          <div className="mono px-4 py-1.5 pr-16 text-[9px] tracking-[0.3em] text-slate-500 uppercase">erik hill</div>
        )}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          <button
            aria-label={sbHeader ? "Collapse header" : "Expand header"}
            aria-expanded={sbHeader}
            onClick={() => toggleChrome("sbHeader")}
            className="mono grid h-5 w-5 cursor-pointer place-items-center rounded text-[9px] text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
          >
            {sbHeader ? "▾" : "▸"}
          </button>
          {!onNavigate && (
            <button
              aria-label="Collapse navigation"
              onClick={() => toggleChrome("sidebar")}
              className="mono grid h-5 w-5 cursor-pointer place-items-center rounded text-[10px] text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
            >
              ⟨
            </button>
          )}
        </div>
      </div>

      {/* search — filters the two lists below; with both folded it has
          nothing to filter, so it folds with them */}
      {(sbProjects || sbAgents) && (
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
      )}

      {/* projects — claims the flex space only while OPEN; a folded section
          that still stretches leaves a large empty box with agents pinned to
          the bottom, which reads as "didn't close" */}
      <div className={sbProjects ? "min-h-0 flex-1 overflow-y-auto py-3" : "shrink-0 py-1.5"}>
        {sbProjects && pinned.length > 0 && (
          <>
            <div className="mono px-4 pb-1 text-[9.5px] tracking-[0.25em] text-amber-300/70 uppercase">pinned</div>
            {pinned.map(projectRow)}
            <div className="mx-4 my-2 border-t border-white/6" />
          </>
        )}
        <button
          aria-expanded={sbProjects}
          onClick={() => toggleChrome("sbProjects")}
          className={`mono flex w-full cursor-pointer items-center gap-1.5 px-4 text-left text-[9.5px] tracking-[0.25em] whitespace-nowrap text-slate-400 uppercase transition hover:text-slate-200 ${sbProjects ? "pb-2" : ""}`}
        >
          <span className="text-slate-600">{sbProjects ? "▾" : "▸"}</span>
          projects <span className="text-slate-700">· {visible.length}</span>
        </button>
        {sbProjects && rest.map(projectRow)}
        {sbProjects && visible.length === 0 && <div className="mono px-4 py-2 text-[10px] text-slate-500">nothing matches "{search}"</div>}
        {sbProjects && PORTALS.some((w) => match(w.name)) && (
          <>
            <div className="mx-4 my-2 border-t border-white/6" />
            <div className="mono px-4 pb-1 text-[9.5px] tracking-[0.25em] text-slate-500 uppercase">
              portals <span className="text-slate-700">· live</span>
            </div>
            {PORTALS.filter((w) => match(w.name)).map((w) => {
              const newTab = wormholeTarget(w.url).newTab;
              return (
                <a
                  key={w.id}
                  href={w.url}
                  {...(newTab ? { target: "erikhill-out" } : {})}
                  className="group flex w-full items-center gap-2.5 px-4 py-[6px] transition hover:bg-white/4"
                  title={w.claim}
                >
                  <span className="mono flex-none text-[10px]" style={{ color: w.hue }}>◍</span>
                  <span className="mono flex-1 truncate text-[11px] text-slate-400 group-hover:text-slate-200">{w.name}</span>
                  <span className="mono flex-none text-[8px] tracking-wider text-slate-600 uppercase">{newTab ? "↗" : "→"}</span>
                </a>
              );
            })}
          </>
        )}
      </div>

      {/* agents */}
      <div className={`border-t border-white/8 ${sbAgents ? "py-3" : "py-1.5"}`}>
        <button
          aria-expanded={sbAgents}
          onClick={() => toggleChrome("sbAgents")}
          className={`mono flex w-full cursor-pointer items-center gap-1.5 px-4 text-left text-[9.5px] tracking-[0.25em] whitespace-nowrap text-slate-400 uppercase transition hover:text-slate-200 ${sbAgents ? "pb-2" : ""}`}
        >
          <span className="text-slate-600">{sbAgents ? "▾" : "▸"}</span>
          agents <span className="text-slate-700">· {visibleAgents.length}</span>
        </button>
        {sbAgents && visibleAgents.map((a) => {
          const pid = assignments[a.id];
          const projectName = pid ? projects.find((p) => p.id === pid)?.name : undefined;
          const scoped = a.scope !== "global";
          return (
            <button
              key={a.id}
              onClick={() => {
                openChat(a.id);
                onNavigate?.();
              }}
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
