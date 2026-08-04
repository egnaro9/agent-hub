import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReactFlow } from "@xyflow/react";
import { useHub } from "../state/hub";
import { arrangeLayout } from "./arrangeLayout";
import { YAW_MAX_DEG, fieldPointer, markFieldActive, stageFitPadding, useOrrery } from "./orrery";

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
  const applyLayout = useHub((s) => s.applyLayout);
  const rf = useReactFlow();

  // The arrange tween lives here and not in the store: rf.setNodes in a
  // controlled setup diffs against React Flow's node lookup and emits the
  // changes through onNodesChange — the SAME channel a hand-drag uses — so the
  // canvas's node state and hit-testing stay true on every frame. Writing the
  // tween into the store instead would move nothing: the canvas seeds its
  // nodes from the store once and never re-reads positions.
  const arrangeRaf = useRef(0);
  const arranging = useRef(false);
  useEffect(() => () => cancelAnimationFrame(arrangeRaf.current), []);

  const arrange = () => {
    // Locked means frozen — arranging IS moving — and a second click mid-tween
    // would fork two animations over the same nodes.
    if (mapLocked || arranging.current) return;
    const s = useHub.getState();
    const target = arrangeLayout(s.agents, s.projects, s.structural, s.assignments);
    const finish = (fitMs: number) => {
      arranging.current = false;
      // Persisted through the same positions mechanism a drag uses, so the
      // arranged map survives a reload exactly like a hand-placed one.
      applyLayout(target);
      // stageFitPadding, not a bare 0.12: React Flow fits into the OVERSIZED
      // stage, and fitting that instead of the window is what hung the agent
      // column 66px off-glass after a 3d arrange.
      rf.fitView({ padding: stageFitPadding(useOrrery.getState().flat), duration: fitMs });
    };
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Same destination, no journey — the house rule Particles already keeps.
      rf.setNodes((nds) => nds.map((n) => (target[n.id] ? { ...n, position: target[n.id] } : n)));
      finish(0);
      return;
    }
    arranging.current = true;
    // Start positions captured once, so a frame never lerps from its own output.
    const from = new Map(rf.getNodes().map((n) => [n.id, n.position]));
    const DUR = 650;
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // easeInOutCubic
    const step = (now: number) => {
      // Lock arrived mid-tween: locked means the map stops moving on you,
      // and this tween is the thing moving it. The layout the operator asked
      // for still LANDS — a jump to the targets, persisted — but the motion
      // ends here, and no fitView runs: lock froze the camera too, and the
      // fit button remains one deliberate click away.
      if (useHub.getState().mapLocked) {
        rf.setNodes((nds) => nds.map((n) => (target[n.id] ? { ...n, position: target[n.id] } : n)));
        arranging.current = false;
        applyLayout(target);
        return;
      }
      const k = ease(Math.min(1, (now - t0) / DUR));
      rf.setNodes((nds) =>
        nds.map((n) => {
          const to = target[n.id];
          const at = from.get(n.id);
          return to && at
            ? { ...n, position: { x: at.x + (to.x - at.x) * k, y: at.y + (to.y - at.y) * k } }
            : n;
        })
      );
      if (now - t0 < DUR) arrangeRaf.current = requestAnimationFrame(step);
      else finish(400);
    };
    arrangeRaf.current = requestAnimationFrame(step);
  };

  // ── The spin strip ───────────────────────────────────────────────────────
  // The orrery's yaw is driven HERE, from a dedicated drag-strip, and not by a
  // modifier-drag on the pane: plain drag must stay pan, Shift-drag is already
  // React Flow's selection box, and any pane-level pointer interception has to
  // win a fight with d3-zoom's event graph. A strip in the HUD touches none of
  // that — every existing gesture on the canvas keeps its exact meaning.
  // Yaw writes go straight to the orrery store (which fans out as a CSS var);
  // aria-valuenow is kept fresh imperatively so a slow drift never renders HUD.
  const orreryFlat = useOrrery((s) => s.flat);
  const toggleFlat = useOrrery((s) => s.toggleFlat);
  const stripRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ x: number; yaw: number } | null>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const apply = (yaw: number) => el.setAttribute("aria-valuenow", String(Math.round(yaw)));
    apply(useOrrery.getState().yaw);
    return useOrrery.subscribe((s) => apply(s.yaw));
  }, []);
  // Locked freezes the spin exactly like it freezes zoom and drags; flat means
  // there is no third axis to spin. Both leave the strip visible so the answer
  // to "where did the dial go" is a tooltip, not a mystery.
  const spinDisabled = mapLocked || orreryFlat;
  const endGrab = () => {
    grab.current = null;
    useOrrery.getState().setDragging(false);
  };

  const ctl =
    "mono grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[13px] text-slate-300 transition hover:bg-white/10 hover:text-slate-100";

  return (
    // data-hub-overlay: lets the e2e alignment sweep tell "occluded by the
    // HUD's own chrome" apart from "hit-test desync" — only the latter fails.
    // The pointer handlers feed the shared fieldPointer ledger (orrery.ts):
    // the HUD is a sibling of the canvas, so without them a cursor parked on
    // a HUD button read as "pointer gone" and the drift swayed the field
    // behind the control being aimed at. The root itself is
    // pointer-events-none — these only fire via the pointer-events-auto
    // clusters inside, which is exactly the "over HUD chrome" signal.
    <div
      data-hub-overlay
      className="pointer-events-none absolute inset-0 z-20"
      onPointerEnter={() => {
        fieldPointer.overHud = true;
        markFieldActive();
      }}
      onPointerLeave={() => {
        fieldPointer.overHud = false;
        markFieldActive();
      }}
      onPointerMove={markFieldActive}
      onPointerDown={markFieldActive}
    >
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
            // Same window-not-stage padding as the arrange fit (orrery.ts).
            onClick={() => rf.fitView({ padding: stageFitPadding(orreryFlat), duration: 400 })}
            title="Fit the whole constellation"
            aria-label="Fit view"
          >
            ⤢
          </button>
          <button
            className={`${ctl} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
            onClick={arrange}
            disabled={mapLocked}
            title={
              mapLocked
                ? "Locked: arranging moves every card. Unlock the map to arrange."
                : "arrange · agents center, projects fanned"
            }
            aria-label="Arrange: agents center, projects fanned"
          >
            ⌗
          </button>
          <div
            ref={stripRef}
            role="slider"
            tabIndex={spinDisabled ? -1 : 0}
            aria-label="Spin the field"
            aria-valuemin={-YAW_MAX_DEG}
            aria-valuemax={YAW_MAX_DEG}
            aria-disabled={spinDisabled}
            title={
              mapLocked
                ? "Locked: the spin is frozen with the rest of the map. Unlock to yaw."
                : orreryFlat
                  ? "Flat view — the spin dial sleeps. Switch back to 3d to yaw."
                  : `spin · drag to yaw the field (±${YAW_MAX_DEG}°) · double-click to center`
            }
            onPointerDown={(e) => {
              if (spinDisabled) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              grab.current = { x: e.clientX, yaw: useOrrery.getState().yaw };
              useOrrery.getState().setDragging(true);
            }}
            onPointerMove={(e) => {
              if (!grab.current) return;
              useOrrery.getState().setYaw(grab.current.yaw + (e.clientX - grab.current.x) * 0.12);
            }}
            onPointerUp={endGrab}
            onPointerCancel={endGrab}
            onDoubleClick={() => {
              if (!spinDisabled) useOrrery.getState().setYaw(0);
            }}
            onKeyDown={(e) => {
              if (spinDisabled) return;
              const o = useOrrery.getState();
              if (e.key === "ArrowLeft") o.setYaw(o.yaw - 2);
              else if (e.key === "ArrowRight") o.setYaw(o.yaw + 2);
              else if (e.key === "Home") o.setYaw(0);
              else return;
              o.markManual(); // the drift yields to the hand for a beat
            }}
            className={`mono grid h-7 w-9 touch-none place-items-center rounded-md text-[12px] transition select-none ${
              spinDisabled
                ? "cursor-default text-slate-600"
                : "cursor-ew-resize text-slate-300 hover:bg-white/10 hover:text-slate-100"
            }`}
          >
            ↻
          </div>
          <button
            onClick={toggleFlat}
            aria-pressed={!orreryFlat}
            aria-label={orreryFlat ? "Raise the 3D orrery" : "Flatten to the classic view"}
            title={
              orreryFlat
                ? "Flat view. Click to raise the 3D orrery — tilt, spin, depth."
                : "3D orrery. Click to flatten to the classic top-down view."
            }
            className={`mono flex cursor-pointer items-center rounded-md px-1.5 py-1 text-[10px] tracking-wider transition ${
              orreryFlat ? "text-slate-400 hover:bg-white/10 hover:text-slate-200" : "bg-cyan-400/15 text-cyan-200"
            }`}
          >
            {orreryFlat ? "▱ flat" : "◇ 3d"}
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/10" />
          <button
            onClick={toggleMapLock}
            aria-pressed={mapLocked}
            aria-label={mapLocked ? "Unlock the view" : "Lock the view"}
            title={
              mapLocked
                ? "Locked: scroll and pinch won't zoom, cards can't be dragged, and the orrery spin is frozen. Drag to pan and the +/−/fit buttons still work. Click to unlock."
                : "Lock the map: stops trackpad scroll from zooming, cards from being dragged, and the orrery from spinning. Panning stays on."
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
