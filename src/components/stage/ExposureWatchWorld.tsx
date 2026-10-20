import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The exposure-watch project world: the triage desk. Does an AI agent beat
// plain code at deciding whether installed software is exposed to a
// known-exploited vulnerability? Every number below is the repo's published
// record: README.md and runs/heldout/report.json at c633cb5. The honest half
// of the result is printed as large as the flattering half: on correct
// answers the held-out set is a TIE. Never let this scene say the agents won.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the feed line) and pointer parallax are ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const HUE = "#e879f9";

// The held-out table, 57 pairs per approach: correct, sent to a person, wrong
// (wrong = over-called + under-called + missed). Each row sums to 57.
const HELD_OUT = [
  { label: "code", correct: 44, person: 0, wrong: 13 },
  { label: "code + keywords", correct: 45, person: 0, wrong: 12 },
  { label: "agent", correct: 48, person: 3, wrong: 6 },
  { label: "agent + verify", correct: 48, person: 3, wrong: 6 },
  { label: "agent + verify + skeptic", correct: 47, person: 10, wrong: 0 },
];
const PAIRS = 57;

export default function ExposureWatchWorld() {
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
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #e879f914, transparent 55%), radial-gradient(900px 700px at 85% 90%, #2dd4bf0e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(232,121,249,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(232,121,249,.24) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the held-out table as five stacked bars, one per approach */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[4%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #e879f955)" }}
        >
          {HELD_OUT.map((row, i) => {
            const x0 = 250;
            const span = 560;
            const y = 40 + i * 62;
            const w = (n: number) => (n / PAIRS) * span;
            return (
              <g key={row.label}>
                <text x={x0 - 14} y={y + 24} textAnchor="end" fill={HUE} fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="1">
                  {row.label}
                </text>
                <rect x={x0} y={y} width={w(row.correct)} height="36" rx="4" fill="#e879f933" stroke={HUE} strokeWidth="1.2" />
                <rect x={x0 + w(row.correct)} y={y} width={w(row.person)} height="36" fill="#2dd4bf33" stroke="#2dd4bf" strokeWidth="1.2" />
                <rect x={x0 + w(row.correct) + w(row.person)} y={y} width={w(row.wrong)} height="36" fill="#fbbf2433" stroke="#fbbf24" strokeWidth="1.2" />
              </g>
            );
          })}
          <text x="450" y="392" textAnchor="middle" fill={HUE} opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            57 HELD-OUT PAIRS
          </text>
        </motion.svg>

        {/* mid layer: the published record, floating */}
        <motion.div
          className="glass absolute w-[250px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 66, rotateY: -6, borderTop: `2px solid ${HUE}`, boxShadow: "0 20px 60px rgba(232,121,249,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">on correct answers</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-fuchsia-300" style={{ textShadow: "0 0 24px #e879f966" }}>
            a tie
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            47 for agent + verify + skeptic, 45 for code + keywords; exact McNemar p = 0.69. Fifty-seven pairs cannot tell them apart.
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[266px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, 9, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "37%", top: "48%", x: midX, z: 16, rotateY: 2, borderTop: `2px solid ${HUE}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">where the errors go</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            code + keywords: <span className="text-amber-300">12 wrong</span>, one of them a missed exposure. agent + verify + skeptic:{" "}
            <span className="text-fuchsia-300">0 wrong</span>, 10 sent to a person, $33.34 for the 57 pairs.
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[256px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "68%", top: "24%", x: midX, z: -20, rotateY: -3.1, borderTop: `2px solid ${HUE}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">round 1, 22 pairs</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            a plain matcher plus one keyword rule, tuned on that set, scored as well as the best agent pipeline at $0. The agents found one error in the answer key and one contested label.
          </div>
        </motion.div>

        {/* the pre-registration plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={REDUCE ? undefined : { y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "9%", x: midX, z: 82, rotateY: 3 }}
        >
          <span className="mono text-[10.5px] text-slate-300">
            <span className="breathe" style={{ color: HUE }}>●</span> pre-registered: rules and frozen key pushed before the run · the keyword rule caught 2 of 12 conditional pairs
          </span>
        </motion.div>

        {/* the division-of-labour ribbon */}
        <motion.div
          className="glass absolute left-1/2 bottom-[22%] -translate-x-1/2 rounded-xl border-fuchsia-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-fuchsia-200">
            the verifier catches invented evidence; the skeptic catches <span className="text-fuchsia-300">real evidence attached to the wrong verdict</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-fuchsia-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #e879f966" }}>
            exposure-watch
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Does an AI agent beat plain code at known-exploited-vulnerability triage? Five approaches, scored against an answer key, with cost and planted errors.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-fuchsia-300/50 bg-fuchsia-400/15 px-4 py-2 text-[11.5px] text-fuchsia-200 transition hover:bg-fuchsia-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/exposure-watch"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the repo
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">every recorded answer replays without a model or a key</p>
        </div>
      </motion.div>
    </div>
  );
}
