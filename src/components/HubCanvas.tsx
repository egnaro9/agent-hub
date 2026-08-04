import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
  type MiniMapNodeProps,
} from "@xyflow/react";
import AgentNode from "./nodes/AgentNode";
import ProjectNode from "./nodes/ProjectNode";
import PulseEdge from "./edges/PulseEdge";
import { useHub } from "../state/hub";
import {
  DRIFT_DEG_PER_MIN,
  DRIFT_IDLE_MS,
  STAGE_OVERSIZE,
  TILT_DEG,
  YAW_MAX_DEG,
  fieldPointer,
  markFieldActive,
  scaleForYaw,
  stageFitPadding,
  useOrrery,
} from "./orrery";

const nodeTypes = {
  agent: (p: { id: string }) => <AgentNode id={p.id} />,
  project: (p: { id: string }) => <ProjectNode id={p.id} />,
};
const edgeTypes = { pulse: PulseEdge };

// The minimap as a radar, not a photocopy: the default gray boxes said "here
// are 25 rectangles" and nothing else. Down here an agent is a glowing dot in
// its own colour — brighter (and softly pulsing) while it's actually talking or
// working — and a project is a dim slate blip, so the corner answers the only
// question a minimap gets asked: where is everyone, and who's alive right now?
function RadarNode({ id, x, y, width, height }: MiniMapNodeProps) {
  const agent = useHub((s) => s.agents.find((a) => a.id === id));
  if (agent) {
    const live = agent.status.kind === "talking" || agent.status.kind === "working";
    const cx = x + width / 2;
    const cy = y + height / 2;
    // Sized from the node's own footprint so the dot survives any graph scale
    // the minimap picks; the halo is what makes it read as a light, not a box.
    const r = Math.min(width, height) * (live ? 0.34 : 0.26);
    const pulse =
      live &&
      typeof matchMedia !== "undefined" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r * 2.4} fill={agent.color} opacity={live ? 0.28 : 0.14} />
        <circle cx={cx} cy={cy} r={r} fill={agent.color} opacity={live ? 1 : 0.75}>
          {/* SMIL, so the pulse costs no React renders; skipped under reduced motion */}
          {pulse && (
            <animate attributeName="opacity" values="1;0.45;1" dur="1.6s" repeatCount="indefinite" />
          )}
        </circle>
      </g>
    );
  }
  // Projects recede: terrain on the radar, not contacts.
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={Math.min(width, height) * 0.2}
      fill="#233248"
      opacity={0.8}
    />
  );
}

// Node identity and position are React Flow's; everything the nodes DISPLAY
// (status, assignments, tray) lives in the store and is read by id inside the
// node components — so nodes never need re-creation when the sim ticks.
// Seeded from the HYDRATED store (not the mock module) so persisted positions
// and operator-created projects are there from the first frame.
const makeInitialNodes = (): Node[] => {
  const s = useHub.getState();
  return [
    ...s.projects.map((p) => ({ id: p.id, type: "project", position: p.pos, data: {} })),
    ...s.agents.map((a) => ({ id: a.id, type: "agent", position: a.pos, data: {}, zIndex: 10 })),
  ];
};

export default function HubCanvas() {
  const agents = useHub((s) => s.agents);
  const structural = useHub((s) => s.structural);
  const assignments = useHub((s) => s.assignments);
  const conversation = useHub((s) => s.conversation);
  const focusRequest = useHub((s) => s.focusRequest);
  const moveNode = useHub((s) => s.moveNode);
  const mapLocked = useHub((s) => s.mapLocked);
  const flat = useOrrery((s) => s.flat);
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(useMemo(makeInitialNodes, []));

  // Every fit in 3d must aim at the visible WINDOW, not the oversized stage
  // React Flow actually fills — stageFitPadding folds the oversize back out.
  const fitOptions = useMemo(() => ({ padding: stageFitPadding(flat) }), [flat]);

  // ── The 2.5D orrery ──────────────────────────────────────────────────────
  // The stage below carries rotateX(tilt) rotateZ(yaw). The yaw travels as a
  // CSS variable so the stage, the cards' counter-rotation and the minimap's
  // counter-rotation all move from ONE per-frame style write — no React render
  // is ever on the animation path. This effect owns that write, plus the idle
  // drift: degrees per MINUTE, paused while the pointer is over the field OR
  // the HUD chrome (both feed the shared fieldPointer ledger in orrery.ts —
  // the HUD is a sibling, so a canvas-only tracker went blind there and the
  // field swayed behind the button being aimed at), paused under lock
  // (locked = frozen map, one control, one meaning), and never started under
  // prefers-reduced-motion — the strip in the HUD still works there, because a
  // hand on a dial is direct manipulation, not an animation.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flat) return;
    const el = stageRef.current;
    if (!el) return;
    // will-change is a per-frame memory bill, so it is only paid while the
    // yaw is actually moving: each write renews a short lease and the layer
    // hint drops once the field has been still for a beat.
    let wcLease = 0;
    const apply = (deg: number) => {
      el.style.willChange = "transform";
      clearTimeout(wcLease);
      wcLease = window.setTimeout(() => {
        el.style.willChange = "";
      }, 250);
      el.style.setProperty("--hub-yaw", `${deg}deg`);
      // The pull-back travels with the yaw: swinging the field also eases it
      // back so rotated corners stay on glass instead of clipping (orrery.ts).
      el.style.setProperty("--hub-scale", String(scaleForYaw(deg)));
    };
    apply(useOrrery.getState().yaw);
    const unsub = useOrrery.subscribe((s) => apply(s.yaw));
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const done = () => {
      clearTimeout(wcLease);
      el.style.willChange = "";
      unsub();
    };
    if (reduced) return done;
    let raf = 0;
    let last = performance.now();
    let dir = 1;
    const step = (now: number) => {
      // A hidden tab stops rAF but not the clock: unclamped, the first frame
      // back would apply the whole absence in one bite and park the field at
      // the cap. 100ms is the longest frame we will vouch for; time we did
      // not witness does not move the field.
      const dt = Math.min(now - last, 100);
      last = now;
      const o = useOrrery.getState();
      const idle =
        !fieldPointer.overCanvas &&
        !fieldPointer.overHud &&
        now - fieldPointer.lastActive > DRIFT_IDLE_MS &&
        now - o.manualAt > DRIFT_IDLE_MS;
      if (idle && !o.dragging && !useHub.getState().mapLocked) {
        // Ping-pong inside the cap rather than a full turn (see YAW_MAX_DEG),
        // reflecting AT the boundary — clamp then flip, so an overshooting
        // step lands exactly on the cap and the next one is already inbound.
        let yaw = o.yaw + dir * (DRIFT_DEG_PER_MIN / 60000) * dt;
        if (yaw >= YAW_MAX_DEG) {
          yaw = YAW_MAX_DEG;
          dir = -1;
        } else if (yaw <= -YAW_MAX_DEG) {
          yaw = -YAW_MAX_DEG;
          dir = 1;
        }
        o.setYaw(yaw);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      done();
    };
  }, [flat]);

  // ── Drags run on a flat field ────────────────────────────────────────────
  // React Flow's drag math lives in untransformed screen space, so a drag
  // under yaw lands sin(yaw)·distance off cross-track (~67px on a 200px drag
  // at ±16°, measured — see YAW_MAX_DEG). Rather than cap the yaw down to
  // nothing, the field steadies under the hand: yaw eases to 0 in ~120ms on
  // drag start and glides back on release. The pullback scale rides the same
  // CSS write, so both flatten together.
  const preDragYaw = useRef<number | null>(null);
  const yawGlide = useRef(0);
  useEffect(() => () => cancelAnimationFrame(yawGlide.current), []);
  const glideYaw = (to: number, after?: () => void) => {
    cancelAnimationFrame(yawGlide.current);
    const from = useOrrery.getState().yaw;
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || Math.abs(to - from) < 0.05) {
      // Same destination, no journey — the house rule.
      useOrrery.getState().setYaw(to);
      after?.();
      return;
    }
    const DUR = 120; // quick enough to read as the field steadying, not a cut
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DUR);
      useOrrery.getState().setYaw(from + (to - from) * (1 - (1 - k) ** 3)); // easeOutCubic
      if (k < 1) yawGlide.current = requestAnimationFrame(step);
      else after?.();
    };
    yawGlide.current = requestAnimationFrame(step);
  };

  // Projects created at runtime (chat's "new project:") must reach the canvas —
  // the node list is otherwise a one-time snapshot (critic BLOCKER). Existing
  // node positions are preserved; only genuinely new ids are appended.
  const projects = useHub((s) => s.projects);
  useEffect(() => {
    setNodes((prev) => {
      const have = new Set(prev.map((n) => n.id));
      const added = projects
        .filter((p) => !have.has(p.id))
        .map((p) => ({ id: p.id, type: "project", position: p.pos, data: {} }));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [projects, setNodes]);

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = structural.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      // Visible, not loud. At .16 these were rumors; the map read as unrelated
      // islands. The hierarchy to preserve: work edges (PulseEdge, glowing and
      // animated) > these structural links > the background grid dots (.14).
      style: { stroke: "rgba(148,183,255,.4)", strokeWidth: 1.6 },
      labelStyle: { fill: "#7d92b8", fontSize: 9, fontFamily: "ui-monospace, monospace" },
      // A whisper of the app's ground colour behind the label, so it stays
      // legible now that the line under it is bright enough to collide with.
      labelBgStyle: { fill: "rgba(8,12,24,.75)" },
    }));
    const work: Edge[] = Object.entries(assignments).map(([agentId, projectId]) => {
      const agent = agents.find((a) => a.id === agentId);
      return {
        id: `work-${agentId}`,
        source: agentId,
        target: projectId,
        type: "pulse",
        data: { color: agent?.color ?? "#22d3ee" },
      };
    });
    const talk: Edge[] = [];
    if (conversation && conversation.kind === "roundtable") {
      const ps = conversation.participants;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          talk.push({
            id: `talk-${ps[i]}-${ps[j]}`,
            source: ps[i],
            target: ps[j],
            type: "pulse",
            data: { color: "#e2e8f0" },
          });
        }
      }
    }
    return [...base, ...work, ...talk];
  }, [structural, assignments, agents, conversation]);

  useEffect(() => {
    if (!focusRequest) return;
    rf.setCenter(focusRequest.pos.x + 80, focusRequest.pos.y + 60, { zoom: 1.05, duration: 700 });
  }, [focusRequest, rf]);

  return (
    // The window onto the orrery. `perspective` lives out here (so the tilted
    // stage foreshortens for real — that projection IS the depth-scale falloff
    // on far nodes) and `overflow-hidden` clips the oversized stage so it can
    // never paint or catch clicks over the sidebar. Flat mode renders the
    // stage with no transform, no oversize, no scrim — today's exact canvas.
    <div
      className="relative h-full w-full overflow-hidden"
      style={flat ? undefined : { perspective: "1400px" }}
      onPointerMove={markFieldActive}
      onPointerDown={markFieldActive}
      onPointerEnter={() => {
        fieldPointer.overCanvas = true;
        markFieldActive();
      }}
      onPointerLeave={() => {
        fieldPointer.overCanvas = false;
        markFieldActive();
      }}
    >
    <div
      ref={stageRef}
      data-orrery-stage={flat ? "flat" : "3d"}
      className={flat ? "h-full w-full" : "absolute"}
      style={
        flat
          ? undefined
          : {
              // Oversized symmetrically — so fitView's centre and the
              // wheel-zoom cursor anchor stay where the eye expects them —
              // by exactly STAGE_OVERSIZE, derived AND measured in orrery.ts:
              // window edges fully covered at rest, transient dot-grid
              // slivers at the ±16° extremes of the same kind the old
              // 130%×124% already had, ~19% fewer stage pixels rastered per
              // 3d frame. will-change is managed imperatively above, held
              // only while the yaw is actually moving.
              left: `${(-(STAGE_OVERSIZE - 1) / 2) * 100}%`,
              top: `${(-(STAGE_OVERSIZE - 1) / 2) * 100}%`,
              width: `${STAGE_OVERSIZE * 100}%`,
              height: `${STAGE_OVERSIZE * 100}%`,
              transform: `rotateX(${TILT_DEG}deg) rotateZ(var(--hub-yaw, 0deg)) scale(var(--hub-scale, 1))`,
              transformOrigin: "50% 55%",
            }
      }
    >
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={() => {
        // Remember where the sway was — but if a new drag starts while the
        // previous restore is still gliding, keep the ORIGINAL yaw: the
        // mid-glide value is nobody's chosen pose.
        if (preDragYaw.current === null) preDragYaw.current = useOrrery.getState().yaw;
        glideYaw(0);
      }}
      onNodeDragStop={(_, node) => {
        moveNode(node.id, node.position);
        // If the operator flattened mid-drag, 0 is the only honest pose.
        const back = useOrrery.getState().flat ? 0 : (preDragYaw.current ?? 0);
        glideYaw(back, () => {
          preDragYaw.current = null;
          // The drift yields for a beat, same as after a hand on the dial.
          useOrrery.getState().markManual();
        });
      }}
      fitView
      fitViewOptions={fitOptions}
      // LOCKED means: the layout and the zoom level stop moving on you.
      // Trackpad scroll-zoom and double-click-zoom are the things that were
      // resizing the map unbidden, so those go off; drag-to-pan stays on so you
      // can still walk around, and the +/−/fit buttons still work deliberately.
      // Nodes stop being draggable so a pan can't nudge a card by accident.
      nodesDraggable={!mapLocked}
      zoomOnScroll={!mapLocked}
      zoomOnPinch={!mapLocked}
      zoomOnDoubleClick={!mapLocked}
      panOnScroll={false}
      minZoom={0.25}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      deleteKeyCode={null}
    >
      <Background variant={BackgroundVariant.Dots} gap={36} size={1} color="rgba(148,183,255,.14)" />
      {/* React Flow's own Controls are replaced by the HUD's horizontal cluster
          (zoom / fit / lock together), so the stack no longer sits on the hint. */}
    </ReactFlow>
    </div>
    {/* The radar is chrome, not terrain — so it lives OUTSIDE the tilted stage,
        pinned to the window's real bottom-left. Inside the stage it inherited
        the oversize (the stage hangs 12% below the glass to survive rotation),
        which parked the whole radar under the fold in 3d mode; out here it
        needs no counter-rotation at all and sits identically in both modes.
        The app-level ReactFlowProvider (App.tsx) feeds it flow state, same as
        the HUD's zoom buttons. */}
    <MiniMap
      // The radar is its own input surface with its own d3-zoom — the flow's
      // zoomOnScroll flags never reach it. Same promise as the main pane:
      // locked means the zoom level stops moving on you, from EVERY surface.
      pannable={!mapLocked}
      zoomable={!mapLocked}
      position="bottom-left"
      style={{ background: "rgba(8,12,24,.92)", width: 190, height: 130 }}
      nodeComponent={RadarNode}
      maskColor="rgba(5,7,15,.72)"
      // The viewport frame. Despite the svg's graph-unit viewBox, this width
      // is SCREEN pixels — React Flow multiplies it by viewScale internally
      // (index.js: `maskStrokeWidth * viewScale`), so 2 means 2px on glass.
      maskStrokeColor="rgba(34,211,238,.85)"
      maskStrokeWidth={2}
    />
    {/* Atmospheric falloff: under rotateX the top of the frame is the far edge
        of the table, so a fixed top-down scrim (screen-space, outside the
        transform) darkens exactly the nodes that are furthest away — the
        brightness half of the depth read; perspective scale is the other. */}
    {!flat && (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, rgba(5,7,15,.40), rgba(5,7,15,.12) 32%, transparent 54%)",
        }}
      />
    )}
    </div>
  );
}
