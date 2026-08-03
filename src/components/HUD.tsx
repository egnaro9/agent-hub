import { AnimatePresence, motion } from "framer-motion";
import { useReactFlow } from "@xyflow/react";
import { useHub } from "../state/hub";

// Graph-view overlay: the roundtable tray, the camera controls, and the hint.
// All four map controls live in ONE horizontal bar bottom-right, with the hint
// stacked directly above it — React Flow's default vertical stack used to sit
// on top of that text.
export default function HUD() {
  const agents = useHub((s) => s.agents);
  const tray = useHub((s) => s.tray);
  const toggleTray = useHub((s) => s.toggleTray);
  const convene = useHub((s) => s.convene);
  const mapLocked = useHub((s) => s.mapLocked);
  const toggleMapLock = useHub((s) => s.toggleMapLock);
  const rf = useReactFlow();

  const ctl =
    "mono grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[13px] text-slate-300 transition hover:bg-white/10 hover:text-slate-100";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* camera controls + hint, bottom-right, out of the minimap's way */}
      <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col items-end gap-2">
        <div className="mono hidden text-right text-[9.5px] leading-relaxed text-slate-500 md:block">
          drag · zoom · click a project to enter its room
          <br />+ two agents and convene them there
        </div>
        <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-xl p-1">
          <button className={ctl} onClick={() => rf.zoomOut({ duration: 200 })} title="Zoom out" aria-label="Zoom out">
            −
          </button>
          <button className={ctl} onClick={() => rf.zoomIn({ duration: 200 })} title="Zoom in" aria-label="Zoom in">
            +
          </button>
          <button
            className={ctl}
            onClick={() => rf.fitView({ padding: 0.12, duration: 400 })}
            title="Fit the whole constellation"
            aria-label="Fit view"
          >
            ⤢
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/10" />
          <button
            onClick={toggleMapLock}
            aria-pressed={mapLocked}
            aria-label={mapLocked ? "Unlock the view" : "Lock the view"}
            title={
              mapLocked
                ? "View locked — resizing won't refit the map, nodes can't be dragged. Click to unlock."
                : "Lock the view so resizing won't refit the map"
            }
            className={`mono flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[10px] tracking-wider transition ${
              mapLocked ? "bg-amber-400/20 text-amber-200" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
            }`}
          >
            {mapLocked ? "🔒 locked" : "🔓 lock"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {tray.length > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl py-2.5 pr-2.5 pl-4"
          >
            <span className="mono text-[10px] tracking-widest text-slate-400 uppercase">roundtable</span>
            <div className="flex -space-x-1.5">
              {tray.map((id) => {
                const a = agents.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <button
                    key={id}
                    onClick={() => toggleTray(id)}
                    title={`remove ${a.name}`}
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: a.color, border: "2px solid #0b1120" }}
                  >
                    {a.glyph}
                  </button>
                );
              })}
            </div>
            <button
              onClick={convene}
              disabled={tray.length < 2}
              className="mono cursor-pointer rounded-xl border border-cyan-300/50 bg-cyan-400/15 px-3.5 py-1.5 text-[11px] text-cyan-200 transition hover:bg-cyan-400/30 disabled:cursor-default disabled:opacity-40"
            >
              {tray.length < 2 ? "pick 2+ agents" : `convene in the room ▸`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
