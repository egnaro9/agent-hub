import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The Harness Builder project world — the original 2.5D overview, home of the
// published negative result (the flagship torch has since passed to evalmut).
// CSS perspective + pointer parallax; every layer sits at its own depth. The
// numbers in the floating cards are the project's REAL published sweep result.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the dashed topology edges), the pointer parallax, and
// the animate={{y:[...]}} float loops are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function HarnessWorld() {
  const setProjectMode = useHub((s) => s.setProjectMode);
  const sweepDone = useHub((s) => s.harnessSweepDone);
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

  const cards = [
    { name: "one drafter", score: "95%", cost: "$0.031", time: "2.2s", z: 66, x: "8%", y: "52%", tilt: -6, win: true },
    { name: "planner → drafter", score: "90%", cost: "$0.264", time: "9.1s", z: 16, x: "38%", y: "48%", tilt: 2, win: false },
    { name: "planner → 2 drafters → judge", score: "80%", cost: "$0.692", time: "18.3s", z: -33, x: "66%", y: "26%", tilt: 7, win: false },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #fbbf2414, transparent 55%), radial-gradient(900px 700px at 85% 90%, #22d3ee0e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(251,191,36,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the harness topology, huge and dim */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[8%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #fbbf2455)" }}
        >
          {[
            "M150,210 C260,210 260,110 380,110",
            "M150,210 C260,210 260,310 380,310",
            "M520,110 C640,110 640,210 740,210",
            "M520,310 C640,310 640,210 740,210",
          ].map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="7 7" style={REDUCE ? undefined : { animation: "dashflow 1.1s linear infinite" }} />
          ))}
          {[
            { x: 40, y: 180, label: "PLANNER" },
            { x: 380, y: 80, label: "DRAFTER A" },
            { x: 380, y: 280, label: "DRAFTER B" },
            { x: 740, y: 180, label: "JUDGE" },
          ].map((n) => (
            <g key={n.label}>
              <rect x={n.x} y={n.y} width="140" height="60" rx="8" fill="#0b1120" stroke="#fbbf24" strokeWidth="1.5" />
              <text x={n.x + 70} y={n.y + 36} textAnchor="middle" fill="#fbbf24" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="2">
                {n.label}
              </text>
            </g>
          ))}
        </motion.svg>

        {/* mid layer: the real sweep results, floating */}
        {cards.map((c, i) => (
          <motion.div
            key={c.name}
            className="glass absolute w-[240px] rounded-2xl p-4"
            animate={REDUCE ? undefined : { y: [0, i % 2 ? 9 : -9, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
            style={{
              left: c.x,
              top: c.y,
              x: midX,
              transform: `translateZ(${c.z}px) rotateY(${c.tilt}deg)`,
              borderTop: `2px solid ${c.win ? "#2dd4bf" : "#fbbf24"}`,
              boxShadow: c.win ? "0 20px 60px rgba(45,212,191,.15)" : "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">{c.name}</div>
            <div className="mono mt-1 text-[34px] leading-none font-semibold" style={{ color: c.win ? "#2dd4bf" : "#e2e8f0", textShadow: c.win ? "0 0 24px #2dd4bf66" : "none" }}>
              {c.score}
            </div>
            <div className="mono mt-2 flex gap-3 text-[10px] text-slate-500">
              <span>{c.cost}</span>
              <span>{c.time}/task</span>
            </div>
          </motion.div>
        ))}

        {/* the refusal ribbon — the product's whole personality */}
        <motion.div
          className="glass absolute left-1/2 bottom-[24%] -translate-x-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-teal-200">
            verdict: <span className="text-teal-300">“this suite cannot decide between them”</span> — 17 of 20 tasks tied; p&lt;0.05 unreachable
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[10%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-amber-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #fbbf2466" }}>
            harness-builder
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Draw a harness as data, sweep it across real tasks, and let a deterministic suite refuse to declare winners it can't back.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-amber-300/50 bg-amber-400/15 px-4 py-2 text-[11.5px] text-amber-200 transition hover:bg-amber-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://erikhill.dev/harness-builder/sweep.html"
             
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ live sweep demo
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">
            {sweepDone ? "◆ the workroom replayed the recorded sweep — the real one runs in the repo" : 'tip: tell the room to "run the sweep"'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
