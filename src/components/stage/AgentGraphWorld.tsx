import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The agent-graph project world — the thought loop. A ReAct agent with
// guardrails that bite: THINK → ACT → OBSERVE cycling in the back, the tool
// call branching to a locked, sandboxed calculator. A sibling of
// CrashkitWorld: CSS perspective + pointer parallax with layered translateZ
// depth. Every printed claim below is verbatim from the project facts.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the dash crawl on the loop arrows) and pointer
// parallax are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const VIOLET = "#a78bfa";

// Cycle geometry — three nodes equally spaced on a circle, center 400/420
// radius 250, node radius 70. Arcs run clockwise with a 22° margin so the
// arrowheads land just short of the next node.
const NODES = [
  { label: "THINK", cx: 400, cy: 170 },
  { label: "ACT", cx: 616.5, cy: 545 },
  { label: "OBSERVE", cx: 183.5, cy: 545 },
];
const ARCS = [
  "M 493.6 188.2 A 250 250 0 0 1 647.6 454.8", // THINK → ACT
  "M 553.9 617 A 250 250 0 0 1 246.1 617", // ACT → OBSERVE
  "M 152.4 454.8 A 250 250 0 0 1 306.4 188.2", // OBSERVE → THINK
];

export default function AgentGraphWorld() {
  const setProjectMode = useHub((s) => s.setProjectMode);
  const ref = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 60, damping: 15 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 60, damping: 15 });
  const backX = useSpring(useTransform(mx, [-0.5, 0.5], [44, -44]), { stiffness: 50, damping: 18 });
  const midX = useSpring(useTransform(mx, [-0.5, 0.5], [20, -20]), { stiffness: 50, damping: 18 });

  const onMove = (e: React.PointerEvent) => {
    if (REDUCE) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  // The guardrail panels — verbatim, do not embellish.
  const panels = [
    { eyebrow: "guardrail", text: "an AST-sandboxed evaluator — arithmetic and nothing else", w: 262, x: "6%", y: "56%", z: 50, tilt: -6, dur: 6 },
    { eyebrow: "guardrail", text: "a step budget, both tested", w: 206, x: "36%", y: "46%", z: 0, tilt: 3, dur: 5 },
    { eyebrow: "runtime", text: "the demo runs real LangGraph in your tab", w: 244, x: "69%", y: "15%", z: -16, tilt: -7, dur: 7.5 },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #a78bfa14, transparent 55%), radial-gradient(900px 700px at 85% 90%, #fb71850e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(167,139,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the thought loop — THINK → ACT → OBSERVE, huge and dim */}
        <motion.svg
          viewBox="0 0 800 800"
          className="absolute top-[2%] left-1/2 w-[620px] -translate-x-1/2 opacity-30"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 16px #a78bfa55)" }}
        >
          <defs>
            <marker id="ag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={VIOLET} />
            </marker>
          </defs>

          {/* the loop arrows — dash crawl gated for reduced motion */}
          {ARCS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={VIOLET}
              strokeWidth="2"
              strokeDasharray="10 14"
              opacity="0.6"
              markerEnd="url(#ag-arrow)"
              style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
            />
          ))}

          {/* the three nodes of the cycle */}
          {NODES.map((n) => (
            <g key={n.label}>
              <circle cx={n.cx} cy={n.cy} r="70" fill="#a78bfa08" stroke={VIOLET} strokeWidth="2" />
              <circle cx={n.cx} cy={n.cy} r="59" fill="none" stroke={VIOLET} strokeWidth="1" opacity="0.35" />
              <text x={n.cx} y={n.cy + 6} textAnchor="middle" fill={VIOLET} opacity="0.8" fontSize="17" fontFamily="ui-monospace, monospace" letterSpacing="4">
                {n.label}
              </text>
            </g>
          ))}
          <text x="400" y="427" textAnchor="middle" fill={VIOLET} opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            THOUGHT LOOP
          </text>

          {/* side-branch: ACT reaches a tool, and the tool is in a locked box */}
          <line x1="668" y1="594" x2="702" y2="654" stroke={VIOLET} strokeWidth="1.5" strokeDasharray="4 6" opacity="0.5" />
          <rect x="630" y="658" width="150" height="80" rx="10" fill="#a78bfa0a" stroke={VIOLET} strokeWidth="1.5" opacity="0.85" />
          {/* the padlock — shackle + body */}
          <path d="M 699 684 v -5 a 6 6 0 0 1 12 0 v 5" fill="none" stroke={VIOLET} strokeWidth="2" />
          <rect x="696" y="684" width="18" height="13" rx="2.5" fill={VIOLET} opacity="0.85" />
          <text x="705" y="718" textAnchor="middle" fill={VIOLET} opacity="0.8" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="1.5">
            sandboxed calc
          </text>
        </motion.svg>

        {/* mid layer: the guardrail panels, floating */}
        {panels.map((c, i) => (
          <motion.div
            key={c.text}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, i % 2 ? 8 : -8, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: c.w,
              left: c.x,
              top: c.y,
              x: midX,
              z: c.z,
              rotateY: c.tilt,
              borderTop: `2px solid ${VIOLET}`,
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-violet-300/80 uppercase">{c.eyebrow}</div>
            <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">{c.text}</div>
          </motion.div>
        ))}

        {/* the rose ribbon — the standing invitation to attack the sandbox */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(66px)", background: "linear-gradient(90deg, transparent, #fb718555 30%, #fb718588 50%, #fb718555 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 -translate-x-1/2 rounded-xl border-rose-300/40 px-5 py-2.5 whitespace-nowrap"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 99 }}
        >
          <span className="mono text-[11.5px] text-rose-200">
            try breaking the calculator with <span className="text-rose-300" style={{ textShadow: "0 0 14px #fb718566" }}>__import__('os')</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-violet-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #a78bfa66" }}>
            agent-graph
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a ReAct agent with guardrails that bite
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-violet-300/50 bg-violet-400/15 px-4 py-2 text-[11.5px] text-violet-200 transition hover:bg-violet-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/agent-graph/"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ watch it think
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">THINK → ACT → OBSERVE — sandboxed calc — step budget</p>
        </div>
      </motion.div>
    </div>
  );
}
