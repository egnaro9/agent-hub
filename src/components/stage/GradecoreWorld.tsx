import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The gradecore project world — the engine room. One grading engine shared by
// the whole fleet: crashkit, model-drift and harness-builder all draw their
// verdicts from the same package. A sibling of CrashkitWorld: CSS perspective +
// pointer parallax with layered translateZ depth. Every printed claim is
// verbatim from the record — no invented numbers.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (dash crawl on the reactor ring + conduits) and pointer
// parallax are our own, so we gate them here. The diode dots use the .breathe
// class, which index.css already disables under prefers-reduced-motion.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Pointy-top hexagon vertices, center 450/300 — the core.
const HEX_OUTER = "450,150 580,225 580,375 450,450 320,375 320,225";
const HEX_INNER = "450,190 545,245 545,355 450,410 355,355 355,245";

// The fleet: satellite blocks fed by conduits running out of the core.
// Conduit lines are drawn core → satellite so the dash crawl flows outward.
const SATS = [
  { label: "crashkit", rx: 70, ry: 70, rw: 150, x1: 320, y1: 225, x2: 218, y2: 118 },
  { label: "model-drift", rx: 678, ry: 70, rw: 164, x1: 580, y1: 225, x2: 680, y2: 118 },
  { label: "harness-builder", rx: 352, ry: 536, rw: 196, x1: 450, y1: 450, x2: 450, y2: 536 },
];

export default function GradecoreWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #22d3ee1c, transparent 55%), radial-gradient(900px 700px at 85% 90%, #2dd4bf16, transparent 60%), radial-gradient(760px 520px at 50% 42%, #22d3ee0d, transparent 65%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* wall grid — faint, radially masked around the core */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            background:
              "linear-gradient(rgba(34,211,238,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.5) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(900px 620px at 50% 40%, black, transparent 75%)",
          }}
        />
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-30"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(34,211,238,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the engine room — one glowing core, three conduits, the fleet */}
        <motion.svg
          viewBox="0 0 900 620"
          className="absolute top-[1%] left-1/2 w-[780px] -translate-x-1/2 opacity-[0.32]"
          style={{ x: backX, z: -180, filter: "blur(0.6px) drop-shadow(0 0 16px #22d3ee55)" }}
        >
          {/* crosshair axes — the survey lines of the room */}
          <line x1="70" y1="300" x2="830" y2="300" stroke="#22d3ee" strokeWidth="1" opacity="0.08" />
          <line x1="450" y1="40" x2="450" y2="580" stroke="#22d3ee" strokeWidth="1" opacity="0.08" />
          {/* outer orbit — dotted, with tick marks and diamond satellites */}
          <circle cx="450" cy="300" r="270" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 10" opacity="0.18" />
          {Array.from({ length: 24 }, (_, i) => (
            <g key={`t${i}`} transform={`rotate(${i * 15} 450 300)`}>
              <line x1="450" y1="48" x2="450" y2="38" stroke="#22d3ee" strokeWidth="1" opacity="0.25" />
            </g>
          ))}
          {[90, 140, 220, 270].map((a) => (
            <g key={`d${a}`} transform={`rotate(${a} 450 300)`}>
              <rect x="444" y="24" width="12" height="12" transform="rotate(45 450 30)" fill="#22d3ee14" stroke="#22d3ee" strokeWidth="1.5" opacity="0.5" />
            </g>
          ))}
          {/* reactor rings — the dashed one crawls, gated for reduced motion */}
          <circle cx="450" cy="300" r="232" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.2" />
          <circle
            cx="450"
            cy="300"
            r="205"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="10 14"
            opacity="0.5"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          {/* spokes — hex vertices braced against the reactor ring */}
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={`s${a}`} transform={`rotate(${a} 450 300)`}>
              <line x1="450" y1="150" x2="450" y2="95" stroke="#22d3ee" strokeWidth="1" opacity="0.3" />
              <circle cx="450" cy="95" r="3" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.4" />
            </g>
          ))}
          {/* the core */}
          <polygon points={HEX_OUTER} fill="#22d3ee06" stroke="#22d3ee" strokeWidth="2" />
          <polygon points={HEX_INNER} fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.35" />
          <circle cx="450" cy="300" r="64" fill="#22d3ee10" />
          <circle cx="450" cy="272" r="9" fill="#22d3ee" className="breathe" style={{ filter: "drop-shadow(0 0 10px #22d3ee)" }} />
          <text x="450" y="322" textAnchor="middle" fill="#22d3ee" opacity="0.55" fontSize="17" fontFamily="ui-monospace, monospace" letterSpacing="7">
            ONE ENGINE
          </text>

          {/* conduits out to the fleet — solid trace + crawling energy dashes */}
          {SATS.map((s) => (
            <g key={s.label}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#22d3ee" strokeWidth="1" opacity="0.15" />
              <line
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke="#22d3ee"
                strokeWidth="1.5"
                strokeDasharray="6 16"
                opacity="0.7"
                style={REDUCE ? undefined : { animation: "dashflow 1.8s linear infinite" }}
              />
              <circle cx={s.x1} cy={s.y1} r="3.5" fill="#22d3ee" opacity="0.8" />
              <rect x={s.rx} y={s.ry} width={s.rw} height="46" rx="8" fill="#22d3ee08" stroke="#22d3ee" strokeWidth="1.5" opacity="0.9" />
              <text
                x={s.rx + s.rw / 2}
                y={s.ry + 29}
                textAnchor="middle"
                fill="#22d3ee"
                fontSize="14"
                fontFamily="ui-monospace, monospace"
                letterSpacing="2"
              >
                {s.label}
              </text>
            </g>
          ))}
        </motion.svg>

        {/* mid layer: the determinism proof — hashes agree across repos */}
        <motion.div
          className="glass absolute w-[276px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "7%", top: "52%", x: midX, z: 30, rotateY: -6, borderTop: "2px solid #22d3ee", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="flex items-start gap-2.5">
            <span className="breathe mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#22d3ee", boxShadow: "0 0 10px #22d3ee" }} />
            <div className="mono text-[11px] leading-relaxed text-slate-300">
              <span className="text-cyan-300">suite_hash</span> comes out byte-for-byte identical — computed separately in each repo
            </div>
          </div>
        </motion.div>

        {/* the provenance panel — lifted, not rewritten */}
        <motion.div
          className="glass absolute w-[280px] rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "66%", top: "14%", x: midX, z: -10, rotateY: -6, borderTop: "2px solid #22d3ee", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="flex items-start gap-2.5">
            <span className="breathe mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#22d3ee", boxShadow: "0 0 10px #22d3ee" }} />
            <div className="mono text-[11px] leading-relaxed text-slate-300">
              the live board&rsquo;s grading logic, lifted into <span className="text-cyan-300">a shared package</span> — not rewritten from memory
            </div>
          </div>
        </motion.div>

        {/* the CI lock — the frozen suite keeps the hash honest forever */}
        <motion.div
          className="glass absolute w-[280px] rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "67%", top: "44%", x: midX, z: 18, rotateY: -5, borderTop: "2px solid #22d3ee", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-cyan-300/80 uppercase">frozen suite</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            run the board&rsquo;s frozen suite through it and the suite_hash comes out byte-for-byte identical —{" "}
            <span className="text-cyan-300">and a test in CI keeps it that way</span>
          </div>
        </motion.div>

        {/* the no-judges plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "8%", bottom: "8%", x: midX, z: 50 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            <span className="font-semibold text-cyan-300" style={{ textShadow: "0 0 14px #22d3ee66" }}>no LLM-as-judge</span> — every grade reproduces
          </span>
        </motion.div>

        {/* the teal ribbon — the refusal that makes the comparisons honest */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(40px)", background: "linear-gradient(90deg, transparent, #2dd4bf55 30%, #2dd4bf88 50%, #2dd4bf55 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 -translate-x-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 60 }}
        >
          <span className="mono text-[11.5px] text-teal-200">
            <span className="text-teal-300">&ldquo;a comparison that refuses to declare a winner it can&rsquo;t back&rdquo;</span>
          </span>
        </motion.div>

        {/* the sign-test plate — refusal at the verdict level, bottom right */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "8%", x: midX, z: 50 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            the <span className="font-semibold text-teal-300" style={{ textShadow: "0 0 12px #2dd4bf66" }}>sign test</span> refuses undecidable verdicts
          </span>
        </motion.div>

        {/* footer strip — the grader kinds, spelled out along the floor */}
        <div
          className="absolute bottom-[3%] left-1/2 whitespace-nowrap"
          style={{ transform: "translateX(-50%) translateZ(24px)" }}
        >
          <span className="mono text-[9.5px] tracking-[0.18em] text-slate-500">
            <span className="text-cyan-300/70">grader kinds</span> — exact match · substring · regex · numeric compare · set membership
          </span>
        </div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(90px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-cyan-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #22d3ee66" }}>
            gradecore
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            the shared grading engine — no LLM judges anywhere
          </p>
          <p className="mono mt-2 text-[10.5px] text-slate-500">
            one grading engine shared by the whole fleet
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-cyan-300/50 bg-cyan-400/15 px-4 py-2 text-[11.5px] text-cyan-200 transition hover:bg-cyan-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/gradecore"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the engine
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">crashkit — model-drift — harness-builder</p>
        </div>
      </motion.div>
    </div>
  );
}
