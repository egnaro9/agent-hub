import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The match3-engine project world — the pinned board. A match-3 rules engine
// pinned by property invariants: a tilted 8x8 board held in place by an
// orbital ring of locks. A sibling of CrashkitWorld: CSS perspective + pointer
// parallax with layered translateZ depth. Every claim printed below is real.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the dashed lock orbit) and pointer parallax are our
// own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 8x8 board geometry, centered at 400/400 in an 800-square viewBox.
const CELL = 64;
const BOARD0 = 144; // 400 - 4 * CELL

// A few lit gem cells — circles and diamonds in four hues from the app palette.
const GEMS = [
  { c: 2, r: 1, hue: "#a78bfa", shape: "circle", delay: "0s" },
  { c: 5, r: 2, hue: "#22d3ee", shape: "diamond", delay: "0.4s" },
  { c: 1, r: 4, hue: "#fbbf24", shape: "circle", delay: "0.9s" },
  { c: 6, r: 5, hue: "#a78bfa", shape: "diamond", delay: "1.3s" },
  { c: 3, r: 6, hue: "#fb7185", shape: "circle", delay: "0.6s" },
  { c: 4, r: 3, hue: "#22d3ee", shape: "circle", delay: "1.7s" },
] as const;

export default function Match3World() {
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

  const cx = (c: number) => BOARD0 + c * CELL + CELL / 2;
  const cy = (r: number) => BOARD0 + r * CELL + CELL / 2;

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #a78bfa14, transparent 55%), radial-gradient(900px 700px at 85% 90%, #2dd4bf0e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(167,139,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the pinned board — a tilted 8x8 grid inside a lock orbit */}
        <motion.svg
          viewBox="0 0 800 800"
          className="absolute top-[0%] left-1/2 w-[640px] -translate-x-1/2 opacity-30"
          style={{ x: backX, z: -330, rotateX: 24, rotateZ: -8, filter: "blur(0.5px) drop-shadow(0 0 18px #a78bfa55)" }}
        >
          {/* board plate + 8x8 lattice */}
          <rect x={BOARD0} y={BOARD0} width={CELL * 8} height={CELL * 8} fill="#a78bfa06" stroke="#a78bfa" strokeWidth="2" />
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i} stroke="#a78bfa" strokeWidth="1" opacity="0.4">
              <line x1={BOARD0 + (i + 1) * CELL} y1={BOARD0} x2={BOARD0 + (i + 1) * CELL} y2={BOARD0 + CELL * 8} />
              <line x1={BOARD0} y1={BOARD0 + (i + 1) * CELL} x2={BOARD0 + CELL * 8} y2={BOARD0 + (i + 1) * CELL} />
            </g>
          ))}

          {/* lit gems — the .breathe pulse is gated by the app's reduced-motion CSS */}
          {GEMS.map((g) => (
            <g key={`${g.c}-${g.r}`}>
              <rect x={BOARD0 + g.c * CELL + 2} y={BOARD0 + g.r * CELL + 2} width={CELL - 4} height={CELL - 4} fill={`${g.hue}14`} />
              {g.shape === "circle" ? (
                <circle
                  className="breathe"
                  cx={cx(g.c)}
                  cy={cy(g.r)}
                  r="13"
                  fill={`${g.hue}33`}
                  stroke={g.hue}
                  strokeWidth="2"
                  style={{ filter: `drop-shadow(0 0 10px ${g.hue})`, animationDelay: g.delay }}
                />
              ) : (
                <polygon
                  className="breathe"
                  points={`${cx(g.c)},${cy(g.r) - 15} ${cx(g.c) + 15},${cy(g.r)} ${cx(g.c)},${cy(g.r) + 15} ${cx(g.c) - 15},${cy(g.r)}`}
                  fill={`${g.hue}33`}
                  stroke={g.hue}
                  strokeWidth="2"
                  style={{ filter: `drop-shadow(0 0 10px ${g.hue})`, animationDelay: g.delay }}
                />
              )}
            </g>
          ))}

          {/* the pin ring — a dashed orbit of small locks holding the board */}
          <circle
            cx="400"
            cy="400"
            r="368"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1"
            strokeDasharray="4 18"
            opacity="0.35"
            style={REDUCE ? undefined : { animation: "dashflow 2.2s linear infinite" }}
          />
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30} 400 400) translate(400 32)`} opacity={i % 3 ? 0.35 : 0.7}>
              <path d="M -4 0 v -3 a 4 4 0 0 1 8 0 v 3" fill="none" stroke="#a78bfa" strokeWidth="1.5" />
              <rect x="-6.5" y="0" width="13" height="10" rx="2" fill="#a78bfa22" stroke="#a78bfa" strokeWidth="1.5" />
            </g>
          ))}
          <text x="400" y="742" textAnchor="middle" fill="#a78bfa" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            PINNED BOARD
          </text>
        </motion.svg>

        {/* mid layer: the pins themselves — what actually holds the rules in place */}
        <motion.div
          className="glass absolute w-[252px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "7%", top: "52%", x: midX, z: 50, rotateY: -6, borderTop: "2px solid #a78bfa", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-violet-300/80 uppercase">invariants</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            <span className="font-semibold text-violet-300" style={{ textShadow: "0 0 14px #a78bfa66" }}>16</span> jqwik property
            invariants over thousands of generated boards
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[232px] rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "70%", top: "14%", x: midX, z: -16, rotateY: -6, borderTop: "2px solid #a78bfa", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-violet-300/80 uppercase">footprint</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            <span className="font-semibold text-violet-300" style={{ textShadow: "0 0 14px #a78bfa66" }}>zero</span> dependencies
            outside the JDK
          </div>
        </motion.div>

        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "68%", top: "55%", x: midX, z: 33, rotateY: 7, borderTop: "2px solid #a78bfa", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-violet-300/80 uppercase">runtime</div>
          <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">
            TeaVM compiles it to JavaScript — <span className="text-violet-300">playable here</span>
          </div>
        </motion.div>

        {/* the teal ribbon — what the pinning buys you */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(66px)", background: "linear-gradient(90deg, transparent, #2dd4bf55 30%, #2dd4bf88 50%, #2dd4bf55 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 -translate-x-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 99 }}
        >
          <span className="mono text-[11.5px] text-teal-200">
            “a clean, self-contained target for property-based and differential testing”
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-violet-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #a78bfa66" }}>
            match3-engine
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a match-3 rules engine pinned by 16 property invariants
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-violet-300/50 bg-violet-400/15 px-4 py-2 text-[11.5px] text-violet-200 transition hover:bg-violet-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/match3-engine/"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ play the real engine
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">jqwik property invariants — zero dependencies outside the JDK — TeaVM</p>
        </div>
      </motion.div>
    </div>
  );
}
