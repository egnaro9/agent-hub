import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The differential-oracle project world — the mirror. Two independent
// implementations of one spec face each other across a seam of light: the
// React net on the cyan half, the native net on the violet half. Where they
// disagree, one of them is wrong — no answer key required. A sibling of
// HarnessWorld/CrashkitWorld: CSS perspective + pointer parallax, depth
// passed as framer z/rotateY motion styles so translateZ survives the
// animated y float. Every printed number is the project's REAL result.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (dashed arc crawl) and pointer parallax are our own,
// so we gate them here. The seam glow uses .breathe, which index.css already
// disables under prefers-reduced-motion.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One abstract board — outline grid + a few occupied cells. Drawn once on the
// left; the right board is this exact markup under a scale(-1,1) mirror, so
// the two nets are literal reflections of one another.
const CELLS: Array<[number, number]> = [
  [0, 0],
  [1, 2],
  [3, 4],
  [5, 1],
  [2, 5],
  [4, 3],
];

function Board({ hue }: { hue: string }) {
  return (
    <g>
      <rect x="80" y="60" width="280" height="280" rx="10" fill={`${hue}08`} stroke={hue} strokeWidth="2" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`v${i}`} x1={120 + i * 40} y1="60" x2={120 + i * 40} y2="340" stroke={hue} strokeWidth="1" opacity="0.45" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1="80" y1={100 + i * 40} x2="360" y2={100 + i * 40} stroke={hue} strokeWidth="1" opacity="0.45" />
      ))}
      {CELLS.map(([col, row]) => (
        <rect key={`${col}-${row}`} x={87 + col * 40} y={67 + row * 40} width="26" height="26" rx="6" fill={`${hue}30`} />
      ))}
    </g>
  );
}

export default function DifferentialOracleWorld() {
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
        // split-lit: cyan half, violet half, dark trough at the seam
        background:
          "linear-gradient(90deg, rgba(34,211,238,.075), rgba(34,211,238,.02) 44%, transparent 50%, rgba(167,139,250,.02) 56%, rgba(167,139,250,.075)), radial-gradient(900px 600px at 12% 18%, #22d3ee12, transparent 60%), radial-gradient(900px 600px at 88% 82%, #a78bfa12, transparent 60%)",
      }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding — each half lit by its own implementation */}
        <div
          className="absolute bottom-[-12%] left-[-20%] right-1/2 h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(34,211,238,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />
        <div
          className="absolute right-[-20%] bottom-[-12%] left-1/2 h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(167,139,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* the seam — a faint vertical blade of light down the middle */}
        <div
          className="absolute top-0 bottom-0 left-1/2 w-px"
          style={{
            transform: "translateZ(10px)",
            background:
              "linear-gradient(180deg, transparent, rgba(226,232,240,.45) 30%, rgba(226,232,240,.65) 50%, rgba(226,232,240,.45) 70%, transparent)",
          }}
        />
        <div
          className="breathe absolute top-0 bottom-0 left-1/2 w-[3px] -translate-x-1/2"
          style={{
            transform: "translateZ(10px)",
            filter: "blur(4px)",
            background: "linear-gradient(180deg, transparent, #22d3ee55 35%, #e2e8f066 50%, #a78bfa55 65%, transparent)",
          }}
        />

        {/* back layer: two mirrored boards facing each other across the divide */}
        <motion.svg
          viewBox="0 0 1000 440"
          className="absolute top-[5%] left-1/2 w-[900px] -translate-x-1/2 opacity-40"
          style={{ x: backX, z: -180, filter: "blur(0.6px) drop-shadow(0 0 14px #22d3ee33) drop-shadow(0 0 14px #a78bfa33)" }}
        >
          <defs>
            <linearGradient id="oracle-seam-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#a78bfa" />
            </linearGradient>
          </defs>

          {/* the spec's shadow of the seam, at depth */}
          <line x1="500" y1="30" x2="500" y2="410" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 10" opacity="0.14" />

          <Board hue="#22d3ee" />
          <g transform="translate(1000,0) scale(-1,1)">
            <Board hue="#a78bfa" />
          </g>

          {/* every board crosses the divide to be compared — dash crawl gated */}
          {["M360,120 C440,70 560,70 640,120", "M360,200 C440,200 560,200 640,200", "M360,280 C440,330 560,330 640,280"].map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="url(#oracle-seam-arc)"
              strokeWidth="1.5"
              strokeDasharray="7 7"
              style={REDUCE ? undefined : { animation: "dashflow 1.2s linear infinite" }}
            />
          ))}

          <text x="220" y="384" textAnchor="middle" fill="#22d3ee" opacity="0.8" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="4">
            react impl
          </text>
          <text x="780" y="384" textAnchor="middle" fill="#a78bfa" opacity="0.8" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="4">
            native impl
          </text>
        </motion.svg>

        {/* mid layer: the real numbers, floating. The teal card is the
            prediction that held; the seeded card is why it counts. */}
        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "7%", top: "50%", x: midX, z: 30, rotateY: -6, borderTop: "2px solid #2dd4bf", boxShadow: "0 20px 60px rgba(45,212,191,.15)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-teal-300/80 uppercase">the prediction held</div>
          <div className="mono mt-2 text-[15px] leading-snug font-semibold text-teal-300" style={{ textShadow: "0 0 22px #2dd4bf66" }}>
            5,000 boards · 0 disagreements
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[276px] rounded-2xl p-4"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            left: "37%",
            top: "56%",
            x: midX,
            z: 0,
            rotateY: 2,
            borderTop: "2px solid #22d3ee",
            boxShadow: "0 20px 60px rgba(0,0,0,.5), 0 0 40px rgba(167,139,250,.1)",
          }}
        >
          <div className="mono text-[12px] leading-snug text-slate-300">
            planted bug → <span className="font-semibold text-slate-100">2,624 caught</span>, by <span className="text-cyan-300">BO</span>
            <span className="text-violet-300">TH</span> nets
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "70%", top: "48%", x: midX, z: 20, rotateY: 7, borderTop: "2px solid #a78bfa", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[12px] leading-snug text-slate-300">
            seeded — <span className="text-violet-300">a prediction, not a sample</span>
          </div>
        </motion.div>

        {/* the seam ribbon — the whole idea in one sentence */}
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 max-w-[620px] -translate-x-1/2 rounded-xl border-white/25 px-5 py-2.5 text-center"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 60 }}
        >
          <span className="mono text-[11.5px] text-slate-300">
            where they disagree, <span className="text-slate-100">one of them is wrong</span> — and no one had to know the right answer to
            find out
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(90px)" }}>
          <div
            className="mono text-[10px] tracking-[0.35em] uppercase"
            style={{ backgroundImage: "linear-gradient(90deg, #22d3ee, #a78bfa)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          >
            project world
          </div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #22d3ee55, 0 0 40px #a78bfa55" }}>
            differential-oracle
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            write it twice; the disagreement names the liar
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-cyan-300/50 bg-cyan-400/15 px-4 py-2 text-[11.5px] text-cyan-200 transition hover:bg-cyan-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/evals-differential-oracle/"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ run the oracle in your browser
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
