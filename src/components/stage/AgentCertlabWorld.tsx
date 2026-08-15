import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The agent-certlab project world — the proving yards. CI-grade reliability
// certification for coding agents: seeded known defects, artifacts-only
// grading, and a capability contract backed by a replayable evidence bundle.
// Every number below is read from the committed record (COMPARISON.md is
// compiled mechanically and diff-checked in CI).
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// pointer parallax is ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The three task families, drawn as walled yards. `machine` was built
// deliberately harder after both real agents scored 6/6 on the first two.
const YARDS = [
  { label: "INTERVALS", x: 60, note: "single module" },
  { label: "LEDGER", x: 350, note: "three modules, cross-file" },
  { label: "MACHINE", x: 640, note: "coordinated two-file seeds" },
];

export default function AgentCertlabWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #38bdf816, transparent 55%), radial-gradient(900px 700px at 85% 90%, #a3e6350c, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(56,189,248,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.26) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the three walled yards, six seeded cells each */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[4%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #38bdf855)" }}
        >
          {YARDS.map((yd) => (
            <g key={yd.label}>
              <rect x={yd.x} y="96" width="200" height="170" rx="10" fill="#38bdf806" stroke="#38bdf8" strokeWidth="1.5" />
              {/* six seeded-defect cells, 3 × 2 */}
              {[0, 1, 2].map((a) =>
                [0, 1].map((b) => (
                  <rect
                    key={`${a}-${b}`}
                    x={yd.x + 18 + a * 58}
                    y={112 + b * 72}
                    width="48"
                    height="56"
                    rx="6"
                    fill="#38bdf810"
                    stroke="#38bdf8"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                ))
              )}
              <text x={yd.x + 100} y="292" textAnchor="middle" fill="#7dd3fc" opacity="0.8" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="3">
                {yd.label}
              </text>
              <text x={yd.x + 100} y="310" textAnchor="middle" fill="#7dd3fc" opacity="0.5" fontSize="10.5" fontFamily="ui-monospace, monospace">
                {yd.note}
              </text>
            </g>
          ))}
          {/* the wedge gate every agent passes through first */}
          <path d="M450,30 L420,66 L480,66 Z" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="450" y="392" textAnchor="middle" fill="#38bdf8" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            PROVING YARDS
          </text>
        </motion.svg>

        {/* mid layer: the record */}
        <motion.div
          className="glass absolute w-[250px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 66, rotateY: -6, borderTop: "2px solid #38bdf8", boxShadow: "0 20px 60px rgba(56,189,248,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">shipped contracts</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-sky-300" style={{ textShadow: "0 0 24px #38bdf866" }}>
            7
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            two real agents × three families — every committed verdict independently regraded in CI, never trusted
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[266px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "36%", top: "46%", x: midX, z: 16, rotateY: 2, borderTop: "2px solid #38bdf8", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">calibration, by policy</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            null-agent <span className="text-sky-300">0/6</span> · oracle-agent <span className="text-sky-300">6/6</span> · test-deleter <span className="text-sky-300">0/6</span>
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            pytest alone would pass the gutted suite — a wedge that can't produce this separation must not certify anything
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[262px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "68%", top: "23%", x: midX, z: -20, rotateY: 7, borderTop: "2px solid #38bdf8", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-sky-300/80 uppercase">the cloud run</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            one certification earned <span className="text-sky-300">entirely inside GitHub Actions</span> — calibration gate first, headless runs on an ephemeral runner, bundle uploaded as an artifact
          </div>
        </motion.div>

        {/* the machine-family plate — why the third family exists */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={REDUCE ? undefined : { y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "9%", x: midX, z: 82, rotateY: 3 }}
        >
          <span className="mono text-[10.5px] text-slate-300">
            machine family: <span className="text-sky-300">coordinated two-file seeds</span> — reverting either file alone leaves the suite red
          </span>
        </motion.div>

        {/* the ribbon — rule one of the method */}
        <motion.div
          className="glass absolute left-1/2 bottom-[22%] -translate-x-1/2 rounded-xl border-sky-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-sky-200">
            prove the instrument before the finding: <span className="text-sky-300">clean tree passes, seeded tree fails</span> — before any agent runs
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-sky-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #38bdf866" }}>
            agent-certlab
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Certify the agent, not the model: seeded defects, artifacts-only grading, and a capability contract a stranger can re-earn.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-sky-300/50 bg-sky-400/15 px-4 py-2 text-[11.5px] text-sky-200 transition hover:bg-sky-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/agent-certlab"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the lab
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">not a benchmark score — and never the agent's own account of its success</p>
        </div>
      </motion.div>
    </div>
  );
}
