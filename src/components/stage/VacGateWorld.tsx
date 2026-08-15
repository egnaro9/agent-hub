import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The vac-gate project world — the checkpoint. A composite GitHub Action that
// requires a verified capability contract before a workflow may pass: no
// verified contract, no green check. Every claim below is the repo's README
// and test suite, verbatim in spirit and number.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// pointer parallax is ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A sampling of the named failure reasons — the wall's lamps. 17 exist; the
// wall shows enough to make the point that every stop has a name.
const REASONS = [
  "sha256-mismatch",
  "unlisted-file",
  "agent-mismatch",
  "family-mismatch",
  "regrade-unsupported",
  "regrade-not-consistent",
];

export default function VacGateWorld() {
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
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #f43f5e14, transparent 55%), radial-gradient(900px 700px at 85% 90%, #34d3990e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(244,63,94,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(244,63,94,.26) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the wall, its lamps, and the one green arch */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[3%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #f43f5e55)" }}
        >
          {/* the wall spans the whole field */}
          <rect x="20" y="150" width="860" height="26" fill="#f43f5e0a" stroke="#f43f5e" strokeWidth="1.5" />
          {/* refusal lamps, each named */}
          {REASONS.map((r, i) => {
            const x = 92 + i * 124 + (i >= 3 ? 128 : 0);
            return (
              <g key={r}>
                <line x1={x} y1="150" x2={x} y2="120" stroke="#f43f5e" strokeWidth="1.2" />
                <circle className={REDUCE ? undefined : "breathe"} cx={x} cy="112" r="4.5" fill="#f43f5e" style={{ animationDelay: `${i * 0.4}s` }} />
                <text x={x} y="98" textAnchor="middle" fill="#fda4af" opacity="0.7" fontSize="10" fontFamily="ui-monospace, monospace">
                  {r}
                </text>
              </g>
            );
          })}
          {/* the arch — the only way through, and it is green */}
          <path d="M420,176 L420,120 A30,30 0 0 1 480,120 L480,176" fill="none" stroke="#34d399" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 8px #34d39988)" }} />
          <text x="450" y="212" textAnchor="middle" fill="#34d399" opacity="0.85" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="1">
            verified contract
          </text>
          {/* the road through */}
          <line x1="450" y1="218" x2="450" y2="330" stroke="#34d399" strokeWidth="1.2" strokeDasharray="6 8" opacity="0.6" style={REDUCE ? undefined : { animation: "dashflow 1.3s linear infinite" }} />
          <text x="450" y="392" textAnchor="middle" fill="#f43f5e" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            CHECKPOINT
          </text>
        </motion.svg>

        {/* mid layer: the record */}
        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 66, rotateY: -6, borderTop: "2px solid #f43f5e", boxShadow: "0 20px 60px rgba(244,63,94,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">named refusals</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-rose-300" style={{ textShadow: "0 0 24px #f43f5e66" }}>
            17
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            every failure is one named reason and a nonzero exit — and every named failure has a test that feeds the gate corrupted input and proves it fires
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[266px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "38%", top: "44%", x: midX, z: 16, rotateY: 2, borderTop: "2px solid #f43f5e", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">the regrade</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            optionally clones the issuer at the pinned commit and re-earns every verdict with its own regrader — <span className="text-rose-300">"cannot regrade" is not "regraded"</span>
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            unsupported profiles fail with regrade-unsupported rather than silently skipping
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[250px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "69%", top: "24%", x: midX, z: -20, rotateY: 7, borderTop: "2px solid #f43f5e", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-rose-300/80 uppercase">dogfood</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            the lab that issues the contracts <span className="text-rose-300">gates on its own committed contract</span>, full regrade on
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            replay commands are never executed — opaque text addressed to humans, not a shell handed to bundle authors
          </div>
        </motion.div>

        {/* the ribbon */}
        <motion.div
          className="glass absolute left-1/2 bottom-[22%] -translate-x-1/2 rounded-xl border-rose-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-rose-200">
            every PASS states what ran and what deliberately did not — <span className="text-rose-300">a gate that cannot say what it skipped is worse than no gate</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-rose-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #f43f5e66" }}>
            vac-gate
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            The integrity gate: no verified capability contract, no green check. Structural verification always; verdicts re-earned on request.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-rose-300/50 bg-rose-400/15 px-4 py-2 text-[11.5px] text-rose-200 transition hover:bg-rose-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/vac-gate"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the action
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">freshness is the honest gap: the format carries no dates by design, so the gate does not pretend</p>
        </div>
      </motion.div>
    </div>
  );
}
