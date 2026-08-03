import { AnimatePresence, motion } from "framer-motion";
import { useHub } from "../state/hub";

// Graph-view overlay: the roundtable tray and the hint line. Identity and
// rosters live in the sidebar now.
export default function HUD() {
  const agents = useHub((s) => s.agents);
  const tray = useHub((s) => s.tray);
  const toggleTray = useHub((s) => s.toggleTray);
  const convene = useHub((s) => s.convene);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
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

      <div className="mono absolute right-4 bottom-4 hidden text-right text-[9.5px] leading-relaxed text-slate-600 lg:block">
        drag · zoom · click a project to enter its room
        <br />+ two agents and convene them there
      </div>
    </div>
  );
}
