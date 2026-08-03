import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The agentic-dev-harness project world — the loop. A five-stage dev loop
// (Strategy · Execution · Critic · Evaluation · Ops) that reviews itself
// before anything lands. A sibling of CrashkitWorld: CSS perspective +
// pointer parallax with layered translateZ depth. Every printed claim below
// is verbatim harness doctrine — do not embellish.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (signal pulse, node breathe) and pointer parallax are
// our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The five legs of the loop, in running order.
const STAGES = ["Strategy", "Execution", "Critic", "Evaluation", "Ops"];

// The autonomy ladder, top rung first. L2 is where the harness stands today.
const RUNGS = [
  { id: "L4", top: "16%", z: 44, tilt: -4, dur: 7, lit: false },
  { id: "L3", top: "26%", z: 36, tilt: -2, dur: 6, lit: false },
  { id: "L2", top: "36%", z: 28, tilt: 0, dur: 5.5, lit: true },
  { id: "L1", top: "46%", z: 20, tilt: 2, dur: 6.5, lit: false },
  { id: "L0", top: "56%", z: 12, tilt: 4, dur: 7.5, lit: false },
];

export default function HarnessLoopWorld() {
  const setProjectMode = useHub((s) => s.setProjectMode);
  const ref = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 60, damping: 15 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 60, damping: 15 });
  const backX = useSpring(useTransform(mx, [-0.5, 0.5], [24, -24]), { stiffness: 50, damping: 18 });
  const midX = useSpring(useTransform(mx, [-0.5, 0.5], [10, -10]), { stiffness: 50, damping: 18 });

  const onMove = (e: React.PointerEvent) => {
    if (REDUCE) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{
        perspective: "1300px",
        background:
          "radial-gradient(1100px 600px at 30% 10%, #22d3ee12, transparent 55%), radial-gradient(900px 700px at 85% 90%, #fbbf240c, transparent 60%)",
      }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(34,211,238,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the pipeline — five stage nodes, a signal pulse running
            the connector, and an amber return arc closing the loop */}
        <motion.svg
          viewBox="0 0 1000 340"
          className="absolute top-[20%] left-1/2 w-[880px] -translate-x-1/2 opacity-[0.35]"
          style={{ x: backX, z: -180, filter: "blur(0.5px) drop-shadow(0 0 16px #22d3ee55)" }}
        >
          {/* connector rail + traveling signal pulse (dash crawl, gated) */}
          <line x1="130" y1="150" x2="870" y2="150" stroke="#22d3ee33" strokeWidth="1.5" />
          <line
            x1="130"
            y1="150"
            x2="870"
            y2="150"
            stroke="#22d3ee"
            strokeWidth="2"
            strokeDasharray="8 16"
            opacity="0.8"
            style={REDUCE ? undefined : { animation: "dashflow 1.2s linear infinite" }}
          />
          {/* the review path — Ops feeds Strategy again; amber, flowing back */}
          <path d="M900,182 C860,318 140,318 100,182" fill="none" stroke="#fbbf2426" strokeWidth="1.5" />
          <path
            d="M900,182 C860,318 140,318 100,182"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.5"
            strokeDasharray="6 18"
            opacity="0.55"
            style={REDUCE ? undefined : { animation: "dashflow 1.8s linear infinite" }}
          />
          {STAGES.map((name, i) => (
            <g key={name}>
              <circle cx={100 + i * 200} cy="150" r="30" fill="#05070f" stroke="none" />
              <circle cx={100 + i * 200} cy="150" r="30" fill="#22d3ee14" stroke="#22d3ee" strokeWidth="2" />
              <circle cx={100 + i * 200} cy="150" r="18" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.35" />
              {/* staggered breathe = the pulse handing through the legs */}
              <circle
                cx={100 + i * 200}
                cy="150"
                r="5"
                fill="#22d3ee"
                style={
                  REDUCE
                    ? undefined
                    : { animation: "breathe 2.2s ease-in-out infinite", animationDelay: `${i * 0.44}s` }
                }
              />
              <text
                x={100 + i * 200}
                y="210"
                textAnchor="middle"
                fill="#22d3ee"
                opacity="0.75"
                fontSize="15"
                fontFamily="ui-monospace, monospace"
                letterSpacing="3"
              >
                {name}
              </text>
            </g>
          ))}
          <text
            x="500"
            y="290"
            textAnchor="middle"
            fill="#22d3ee"
            opacity="0.5"
            fontSize="19"
            fontFamily="ui-monospace, monospace"
            letterSpacing="8"
          >
            THE LOOP
          </text>
        </motion.svg>

        {/* mid layer: the autonomy ladder — five floating rungs, L2 is home */}
        <motion.div
          className="mono absolute text-[9px] tracking-[0.22em] text-cyan-300/70 uppercase"
          style={{ left: "71%", top: "11.5%", x: midX, z: 44 }}
        >
          autonomy ladder
        </motion.div>
        <motion.div
          className="absolute w-px"
          style={{
            left: "calc(71% + 78px)",
            top: "14%",
            height: "48%",
            x: midX,
            z: 6,
            background: "linear-gradient(transparent, #22d3ee44 15%, #22d3ee44 85%, transparent)",
          }}
        />
        {RUNGS.map((r, i) => (
          <motion.div
            key={r.id}
            className="glass absolute flex items-center justify-between rounded-xl px-3.5 py-1.5"
            animate={{ y: [0, i % 2 ? 5 : -5, 0] }}
            transition={{ duration: r.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              left: "71%",
              top: r.top,
              width: 158,
              x: midX,
              z: r.z,
              rotateY: r.tilt,
              border: r.lit ? "1px solid #22d3ee88" : undefined,
              boxShadow: r.lit
                ? "0 0 30px #22d3ee33, 0 16px 40px rgba(0,0,0,.45)"
                : "0 16px 40px rgba(0,0,0,.45)",
            }}
          >
            <span
              className="mono text-[12px] font-semibold"
              style={{ color: r.lit ? "#22d3ee" : "#64748b", textShadow: r.lit ? "0 0 14px #22d3ee88" : undefined }}
            >
              {r.id}
            </span>
            {r.lit && (
              <span className="mono text-[10px] text-amber-300" style={{ textShadow: "0 0 12px #fbbf2466" }}>
                ◀ current
              </span>
            )}
          </motion.div>
        ))}

        {/* the Stop-hook relay — how one leg hands work to the next */}
        <motion.div
          className="glass absolute rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 268, left: "6%", top: "56%", x: midX, z: 30, rotateY: 5, borderTop: "2px solid #22d3ee", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-cyan-300/80 uppercase">stop hook</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            each leg arms the next through a Stop hook — wiring, not a human, carries the work
          </div>
        </motion.div>

        {/* the judgment split — Critic thinks on colder metal */}
        <motion.div
          className="glass absolute rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 244, left: "34%", top: "52%", x: midX, z: 10, rotateY: -6, borderTop: "2px solid #22d3ee", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-cyan-300/80 uppercase">judgment tier</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            judgment runs on a different, colder model than execution
          </div>
        </motion.div>

        {/* the amber ribbon — the safety rule cutting through the cyan world */}
        <div
          className="absolute right-[12%] bottom-[24.5%] left-[12%] h-px"
          style={{ transform: "translateZ(40px)", background: "linear-gradient(90deg, transparent, #fbbf2455 30%, #fbbf2488 50%, #fbbf2455 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[22%] left-1/2 -translate-x-1/2 rounded-xl border-amber-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 60 }}
        >
          <span className="mono text-[11.5px] whitespace-nowrap text-amber-200">
            reliability earns launch-automation — it never earns gate-removal
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(90px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-cyan-300/80 uppercase">project world</div>
          <h2
            className="mono mt-2 text-[36px] leading-none font-semibold tracking-tight text-slate-50"
            style={{ textShadow: "0 0 40px #22d3ee66" }}
          >
            agentic-dev-harness
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a loop that reviews itself before it lands
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-cyan-300/50 bg-cyan-400/15 px-4 py-2 text-[11.5px] text-cyan-200 transition hover:bg-cyan-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/agentic-dev-harness"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the harness
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">Strategy · Execution · Critic · Evaluation · Ops</p>
        </div>
      </motion.div>
    </div>
  );
}
