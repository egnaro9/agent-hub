import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The evalmut project world — the injection lab, and the program's flagship.
// Mutation testing for eval suites: inject a KNOWN defect into an output the
// grader passes, rerun the grader, and a green verdict on a proven-wrong
// output is a hole. Every number below is the repo's published record.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the feed line) and pointer parallax are ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The false-positive burn-down across the eight adversarial cold-critique
// rounds — the tool-fault FPs found each pass. Zero by round six, held.
const ROUNDS = [4, 12, 6, 7, 2, 0, 0, 0];

export default function EvalmutWorld() {
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

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #a3e63516, transparent 55%), radial-gradient(900px 700px at 85% 90%, #2dd4bf0e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(163,230,53,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(163,230,53,.26) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the injection bench — case in, operator needle, grader out */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[4%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #a3e63555)" }}
        >
          {/* the pipeline: CASE → MUTANT → GRADER, with the verdict fork */}
          {[
            "M150,210 C260,210 260,210 350,210",
            "M510,210 C600,210 600,140 700,140",
            "M510,210 C600,210 600,290 700,290",
          ].map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#a3e635" strokeWidth="1.5" strokeDasharray="7 7" style={REDUCE ? undefined : { animation: "dashflow 1.1s linear infinite" }} />
          ))}
          {[
            { x: 20, y: 180, label: "CASE · GREEN" },
            { x: 350, y: 180, label: "MUTANT · WRONG" },
            { x: 700, y: 110, label: "CAUGHT ✓" },
            { x: 700, y: 260, label: "HOLE ▲" },
          ].map((n) => (
            <g key={n.label}>
              <rect x={n.x} y={n.y} width="160" height="60" rx="8" fill="#0b1120" stroke={n.label.startsWith("HOLE") ? "#fbbf24" : "#a3e635"} strokeWidth="1.5" />
              <text x={n.x + 80} y={n.y + 36} textAnchor="middle" fill={n.label.startsWith("HOLE") ? "#fbbf24" : "#a3e635"} fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="2">
                {n.label}
              </text>
            </g>
          ))}
          {/* the needle over the mutant block — the injection is the method */}
          <g transform="rotate(-38 430 150)">
            <rect x="424" y="70" width="12" height="66" rx="3" fill="#a3e63522" stroke="#a3e635" strokeWidth="1.4" />
            <line x1="430" y1="136" x2="430" y2="168" stroke="#a3e635" strokeWidth="1.6" />
          </g>
          <text x="450" y="392" textAnchor="middle" fill="#a3e635" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            INJECTION LAB
          </text>
        </motion.svg>

        {/* mid layer: the published record, floating */}
        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 66, rotateY: -6, borderTop: "2px solid #a3e635", boxShadow: "0 20px 60px rgba(163,230,53,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">the battery</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-lime-300" style={{ textShadow: "0 0 24px #a3e63566" }}>
            18
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            operators, mined not authored — every one names the real failure it reproduces, and that citation is enforced as a test
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[262px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, 9, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "37%", top: "48%", x: midX, z: 16, rotateY: 2, borderTop: "2px solid #a3e635", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">dogfood, first run</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            3 holes in its own dependency's graders — <span className="text-lime-300">1 blind spot, 2 coverage gaps</span>, and it was fair about which was which
          </div>
        </motion.div>

        {/* the burn-down — eight cold passes, drawn as bars */}
        <motion.div
          className="glass absolute w-[250px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "68%", top: "24%", x: midX, z: -20, rotateY: -3.1, borderTop: "2px solid #a3e635", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">8 adversarial rounds</div>
          <div className="mt-3 flex h-[52px] items-end gap-1.5">
            {ROUNDS.map((n, i) => (
              <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(6, (n / 12) * 100)}%`, background: n === 0 ? "#a3e635" : "#a3e63555", boxShadow: n === 0 ? "0 0 12px #a3e63588" : "none" }} />
            ))}
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            tool-fault false positives per pass — <span className="text-lime-300">zero by round six, held through eight</span>
          </div>
        </motion.div>

        {/* the launch plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={REDUCE ? undefined : { y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "9%", x: midX, z: 82, rotateY: 3 }}
        >
          <span className="mono text-[10.5px] text-slate-300">
            <span className="breathe" style={{ color: "#a3e635" }}>●</span> launched 2026-08-14 · the program's flagship
          </span>
        </motion.div>

        {/* the honesty ribbon — the one rule the whole tool rests on */}
        <motion.div
          className="glass absolute left-1/2 bottom-[22%] -translate-x-1/2 rounded-xl border-lime-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-lime-200">
            never a verdict flip: a hole is <span className="text-lime-300">output-proven-wrong AND grader-passed</span> — wrongness established against ground truth
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-lime-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #a3e63566" }}>
            evalmut
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Your eval suite passes. Does it actually check anything? Inject a known defect and see which checks stay green.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-lime-300/50 bg-lime-400/15 px-4 py-2 text-[11.5px] text-lime-200 transition hover:bg-lime-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/evalmut"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the repo
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">deterministic runner — no LLM judge — a run reproduces exactly</p>
        </div>
      </motion.div>
    </div>
  );
}
