import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The eval-dashboard project world — the light table. Where a run becomes
// visible: an inspection surface with the run's cases laid out like slides,
// one flagged rose and lifted for a closer look. A sibling of CrashkitWorld:
// CSS perspective + pointer parallax with layered translateZ depth. Every
// claim printed below is verbatim from the project record.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (the table backlight, the dashed slot) and pointer
// parallax are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The inspection table: a 4×3 grid of card slots. One slot (row 0, col 2) is
// vacated — its card is drawn separately, rose-tinted and slightly lifted.
const CARD_W = 140;
const CARD_H = 110;
const cardX = (col: number) => 100 + col * 160;
const cardY = (row: number) => 80 + row * 130;
const LIFTED = { row: 0, col: 2 };

export default function EvalDashboardWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #60a5fa14, transparent 55%), radial-gradient(900px 700px at 85% 90%, #2dd4bf0e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(96,165,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the light table — a tilted inspection surface, cases laid out like slides */}
        <motion.svg
          viewBox="0 0 800 520"
          className="absolute top-[7%] left-[calc(50%-330px)] w-[660px] opacity-35"
          style={{ x: backX, z: -297, rotateX: 24, filter: "blur(0.6px) drop-shadow(0 0 16px #60a5fa55)" }}
        >
          {/* corner registration marks */}
          {[
            [52, 32],
            [748, 32],
            [52, 488],
            [748, 488],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} stroke="#60a5fa" strokeWidth="1" opacity="0.5">
              <line x1={x - 8} y1={y} x2={x + 8} y2={y} />
              <line x1={x} y1={y - 8} x2={x} y2={y + 8} />
            </g>
          ))}

          {/* the table surface */}
          <rect x="70" y="50" width="660" height="420" rx="18" fill="#60a5fa06" stroke="#60a5fa" strokeWidth="2" />
          {/* backlight — breathes, gated for reduced motion */}
          <rect
            x="78"
            y="58"
            width="644"
            height="404"
            rx="14"
            fill="#60a5fa0d"
            style={REDUCE ? undefined : { animation: "breathe 4.5s ease-in-out infinite" }}
          />

          {/* faint card outlines in a grid — the run's cases, on the glass */}
          {Array.from({ length: 12 }, (_, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            if (row === LIFTED.row && col === LIFTED.col) return null;
            const x = cardX(col);
            const y = cardY(row);
            return (
              <g key={i}>
                <rect x={x} y={y} width={CARD_W} height={CARD_H} rx="8" fill="#60a5fa05" stroke="#60a5fa" strokeWidth="1" opacity="0.32" />
                <rect x={x + 12} y={y + 14} width="62" height="4" rx="2" fill="#60a5fa" opacity="0.2" />
                <rect x={x + 12} y={y + 26} width="94" height="3" rx="1.5" fill="#60a5fa" opacity="0.12" />
              </g>
            );
          })}

          {/* the vacated slot — dashed, dash crawl gated for reduced motion */}
          <rect
            x={cardX(LIFTED.col)}
            y={cardY(LIFTED.row)}
            width={CARD_W}
            height={CARD_H}
            rx="8"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="6 8"
            opacity="0.35"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          {/* the lifted card — rose-tinted, raised off its slot for inspection */}
          <g transform={`translate(${cardX(LIFTED.col) + 12} ${cardY(LIFTED.row) - 26}) rotate(-3)`} style={{ filter: "drop-shadow(0 10px 14px #fb718544)" }}>
            <rect width={CARD_W} height={CARD_H} rx="8" fill="#fb71850e" stroke="#fb7185" strokeWidth="1.5" opacity="0.9" />
            <rect x="12" y="14" width="62" height="4" rx="2" fill="#fb7185" opacity="0.55" />
            <rect x="12" y="26" width="94" height="3" rx="1.5" fill="#fb7185" opacity="0.3" />
            <circle cx="124" cy="18" r="4" fill="#fb7185" opacity="0.8" />
          </g>

          <text x="400" y="502" textAnchor="middle" fill="#60a5fa" opacity="0.5" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            LIGHT TABLE
          </text>
        </motion.svg>

        {/* mid layer: the render panel — one run in, metric cards and a per-case table out */}
        <motion.div
          className="glass absolute w-[272px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "38%", top: "46%", x: midX, z: 33, rotateY: 3, borderTop: "2px solid #60a5fa", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <svg viewBox="0 0 220 96" className="w-full">
            {/* metric cards */}
            {[0, 76, 152].map((x) => (
              <g key={x}>
                <rect x={x} y="0" width="68" height="26" rx="4" fill="#60a5fa0d" stroke="#60a5fa55" strokeWidth="1" />
                <rect x={x + 7} y="7" width="26" height="3" rx="1.5" fill="#94a3b8" opacity="0.4" />
                <rect x={x + 7} y="15" width="20" height="5" rx="1.5" fill="#60a5fa" opacity="0.75" />
              </g>
            ))}
            {/* per-case table */}
            <rect x="0" y="38" width="220" height="10" rx="2" fill="#60a5fa1a" />
            {[54, 68, 82].map((y) => (
              <g key={y}>
                <rect x="4" y={y + 3} width="40" height="4" rx="2" fill="#94a3b8" opacity="0.3" />
                <rect x="60" y={y + 3} width="28" height="4" rx="2" fill="#94a3b8" opacity="0.22" />
                <rect x="104" y={y + 3} width="28" height="4" rx="2" fill="#94a3b8" opacity="0.22" />
                <rect x="148" y={y + 3} width="20" height="4" rx="2" fill="#94a3b8" opacity="0.22" />
                <rect x="198" y={y + 2} width="18" height="6" rx="2" fill="#2dd4bf" opacity="0.4" />
              </g>
            ))}
          </svg>
          <div className="mono mt-3 text-[10.5px] leading-relaxed text-slate-300">
            turns an eval run into metric cards and a per-case table
          </div>
        </motion.div>

        {/* the flag panel — the rose story: one row lit red on the glass */}
        <motion.div
          className="glass absolute w-[238px] rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "69%", top: "14%", x: midX, z: -16, rotateY: -6, borderTop: "2px solid #fb7185", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <svg viewBox="0 0 200 46" className="w-full">
            <rect x="0" y="0" width="200" height="12" rx="3" fill="#94a3b8" opacity="0.1" />
            <rect x="0" y="17" width="200" height="12" rx="3" fill="#fb718526" stroke="#fb7185" strokeWidth="1" style={{ filter: "drop-shadow(0 0 6px #fb718566)" }} />
            <circle cx="9" cy="23" r="2.5" fill="#fb7185" />
            <rect x="0" y="34" width="200" height="12" rx="3" fill="#94a3b8" opacity="0.1" />
          </svg>
          <div className="mono mt-3 text-[10.5px] leading-relaxed text-slate-300">
            flags hallucinations in{" "}
            <span className="font-semibold text-rose-300" style={{ textShadow: "0 0 14px #fb718566" }}>
              red
            </span>
          </div>
        </motion.div>

        {/* the teal beam — the wire format cutting under the human-facing glass */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(66px)", background: "linear-gradient(90deg, transparent, #2dd4bf55 30%, #2dd4bf88 50%, #2dd4bf55 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ x: "-50%", z: 99 }}
        >
          <span className="mono text-[11.5px] text-teal-200">
            the dashboard is for the human — <span className="text-teal-300">the wire format is for everything else</span>
          </span>
        </motion.div>

        {/* the rigor plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "8%", bottom: "8%", x: midX, z: 82 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            strict TypeScript · runtime schema validation ·{" "}
            <span className="font-semibold text-blue-300" style={{ textShadow: "0 0 14px #60a5fa66" }}>
              29 tests
            </span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-blue-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #60a5fa66" }}>
            eval-dashboard
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            turns an eval run into something a human can read
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-blue-300/50 bg-blue-400/15 px-4 py-2 text-[11.5px] text-blue-200 transition hover:bg-blue-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/eval-dashboard/"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ open the live dashboard
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
