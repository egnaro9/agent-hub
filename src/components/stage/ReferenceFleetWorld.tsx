import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The reference-fleet project world — the fleet review. Certified reference
// models for AI evals: six deterministic members, each broken in exactly one
// documented way at a stated seeded rate, so pointing a benchmark at the
// fleet measures the BENCHMARK. Every number below is the published record.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// pointer parallax and the beacon pulse are ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Fleet v1, verbatim member ids — six hulls on the review line.
const MEMBERS = [
  "citation-hallucinator",
  "constraint-dropper",
  "refuse-then-comply",
  "tool-arg-swapper",
  "sycophancy-flip",
  "stale-cutoff",
];

export default function ReferenceFleetWorld() {
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
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #f9731614, transparent 55%), radial-gradient(900px 700px at 85% 90%, #a3e6350c, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(249,115,22,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,.26) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: six hulls on the review line, each flying its defect flag */}
        <motion.svg
          viewBox="0 0 920 400"
          className="absolute top-[5%] left-1/2 w-[900px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #f9731655)" }}
        >
          <line x1="20" y1="250" x2="900" y2="250" stroke="#f97316" strokeWidth="1" opacity="0.4" />
          {MEMBERS.map((m, i) => {
            const x = 82 + i * 152;
            return (
              <g key={m}>
                {/* the hull: same silhouette for all six — the defect is the only difference */}
                <path d={`M${x - 44},250 L${x - 30},214 L${x + 30},214 L${x + 44},250 Z`} fill="#f9731608" stroke="#f97316" strokeWidth="1.5" />
                <line x1={x} y1="214" x2={x} y2="178" stroke="#f97316" strokeWidth="1.2" />
                <circle className={REDUCE ? undefined : "breathe"} cx={x} cy="172" r="4" fill="#f97316" style={{ animationDelay: `${i * 0.45}s` }} />
                <text x={x} y="286" textAnchor="middle" fill="#fdba74" opacity="0.75" fontSize="10.5" fontFamily="ui-monospace, monospace" letterSpacing="1">
                  {m.split("-")[0]}
                </text>
                <text x={x} y="300" textAnchor="middle" fill="#fdba74" opacity="0.55" fontSize="10.5" fontFamily="ui-monospace, monospace" letterSpacing="1">
                  {m.split("-").slice(1).join("-")}
                </text>
              </g>
            );
          })}
          <text x="460" y="368" textAnchor="middle" fill="#f97316" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            FLEET REVIEW
          </text>
        </motion.svg>

        {/* mid layer: the claims */}
        <motion.div
          className="glass absolute w-[258px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 66, rotateY: -6, borderTop: "2px solid #f97316", boxShadow: "0 20px 60px rgba(249,115,22,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">the certificate</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            defects injected by a sha256 PRF — the realized count over a fixed request set is <span className="text-orange-300">a constant, not a sample</span>
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            provenance · determinism · rate · tellability — proven per member in tests
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "38%", top: "46%", x: midX, z: 20, rotateY: 3, borderTop: "2px solid #f97316", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">the audit board</div>
          <div className="mono mt-1 text-[30px] leading-none font-semibold text-orange-300" style={{ textShadow: "0 0 24px #f9731666" }}>
            1 / 6
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            what a naive contains-check caught; CI re-runs the audit on every push — a board it cannot reproduce does not deploy
          </div>
        </motion.div>

        {/* fleet v2 — the native member */}
        <motion.div
          className="glass absolute w-[276px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "67%", top: "22%", x: midX, z: -20, rotateY: 7, borderTop: "2px solid #f97316", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-orange-300/80 uppercase">v2 · native — trained into weights</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            refuse-then-comply, LoRA-tuned into a 0.5B on consumer silicon: <span className="text-orange-300">mixture 0.507 in, 0.200 out</span> greedy — 0.380 at temp 0.3
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            rate control through training is lossy; a trained member's decoding config is part of its defect spec
          </div>
        </motion.div>

        {/* the paper plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={REDUCE ? undefined : { y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "9%", x: midX, z: 82, rotateY: 3 }}
        >
          <span className="mono text-[10.5px] text-slate-300">
            write-up: <span className="text-orange-300">“Exactness Is the Price of Nativeness”</span> — native/paper/paper2.md
          </span>
        </motion.div>

        {/* the framing ribbon */}
        <motion.div
          className="glass absolute left-1/2 bottom-[22%] -translate-x-1/2 rounded-xl border-orange-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-orange-200">
            “broken this way 40% of the time <span className="text-orange-300">by construction</span>. Your benchmark scored it 91%.”
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-orange-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #f9731666" }}>
            reference-fleet
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Certified reference materials, for evals: models with known defects at stated rates, so your instrument can be proven to read correctly.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-orange-300/50 bg-orange-400/15 px-4 py-2 text-[11.5px] text-orange-200 transition hover:bg-orange-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://erikhill.dev/reference-fleet/"
             
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ the audit board
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">nothing is trained in v1, and no LLM judges anything</p>
        </div>
      </motion.div>
    </div>
  );
}
