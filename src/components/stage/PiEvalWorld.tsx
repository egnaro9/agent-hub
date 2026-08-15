import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The pi-eval project world — the predicate bench. Deterministic grading as a
// pi package: five fixed predicate blocks bolted to a rail, deliberately rigid
// and orderly, because the whole point is that nothing about a grade moves. A
// sibling of CrashkitWorld: CSS perspective + pointer parallax with layered
// translateZ depth. Every claim printed below is verbatim — do not embellish.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the rail dash) and pointer parallax are our own, so we
// gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The five predicates on the bench — identical housings, different glyphs.
const GLYPHS = ["=", "⊂", "≈", "#", "∈"];
// Block centers along the rail, viewBox 0..800.
const CENTERS = GLYPHS.map((_, i) => 108 + i * 146);

export default function PiEvalWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1200px 640px at 30% 8%, #2dd4bf1c, transparent 55%), radial-gradient(1000px 720px at 85% 88%, #22d3ee14, transparent 60%), radial-gradient(680px 420px at 50% 98%, #2dd4bf0e, transparent 70%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[50%] opacity-30"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(45,212,191,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />
        {/* faint ceiling grid mirroring the floor — the room is calibrated on both planes */}
        <div
          className="absolute top-[-10%] right-[-20%] left-[-20%] h-[30%] opacity-10"
          style={{
            transform: "rotateX(-68deg)",
            transformOrigin: "top",
            background:
              "linear-gradient(rgba(45,212,191,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,.3) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(black 30%, transparent)",
          }}
        />

        {/* back layer: the bench — five identical predicate blocks bolted to a rail,
            sitting inside a larger calibrated field (orbit lines, datum ruler,
            satellite glyphs drifting off-station) */}
        <motion.svg
          viewBox="-100 -50 1000 440"
          className="absolute top-[2%] left-1/2 w-[960px] -translate-x-1/2 opacity-[0.34]"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 16px #2dd4bf55)" }}
        >
          {/* faint orbit lines around the bench */}
          <ellipse cx="400" cy="150" rx="470" ry="182" fill="none" stroke="#2dd4bf" strokeWidth="1" opacity="0.12" />
          <ellipse cx="400" cy="150" rx="492" ry="198" fill="none" stroke="#2dd4bf" strokeWidth="1" strokeDasharray="4 12" opacity="0.09" />
          {/* top datum ruler — the field is measured before anything is graded */}
          <line x1="-60" y1="-24" x2="860" y2="-24" stroke="#2dd4bf" strokeWidth="1" opacity="0.18" />
          {Array.from({ length: 24 }, (_, k) => (
            <line
              key={`t${k}`}
              x1={-60 + k * 40}
              y1="-24"
              x2={-60 + k * 40}
              y2={k % 4 ? -18 : -12}
              stroke="#2dd4bf"
              strokeWidth="1"
              opacity={k % 4 ? 0.15 : 0.3}
            />
          ))}
          {CENTERS.map((cx, i) => (
            <g key={GLYPHS[i]}>
              {/* alignment tick above each station — everything on this bench lines up */}
              <line x1={cx} y1="56" x2={cx} y2="72" stroke="#2dd4bf" strokeWidth="1" opacity="0.35" />
              {/* the housing: identical for all five, corners bolted down */}
              <rect x={cx - 56} y="84" width="112" height="112" rx="10" fill="#2dd4bf08" stroke="#2dd4bf" strokeWidth="2" />
              {[
                [cx - 43, 97],
                [cx + 43, 97],
                [cx - 43, 183],
                [cx + 43, 183],
              ].map(([bx, by]) => (
                <circle key={`${bx}-${by}`} cx={bx} cy={by} r="2.5" fill="#2dd4bf" opacity="0.5" />
              ))}
              <text x={cx} y="156" textAnchor="middle" fill="#2dd4bf" opacity="0.8" fontSize="46" fontFamily="ui-monospace, monospace">
                {GLYPHS[i]}
              </text>
              {/* mounting stem down to the rail */}
              <rect x={cx - 5} y="196" width="10" height="28" fill="#2dd4bf22" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" />
            </g>
          ))}
          {/* the rail itself, bolt heads at even intervals */}
          <rect x="24" y="224" width="752" height="14" rx="3" fill="#2dd4bf08" stroke="#2dd4bf" strokeWidth="2" />
          {Array.from({ length: 9 }, (_, k) => (
            <circle key={k} cx={108 + k * 73} cy="231" r="2" fill="#2dd4bf" opacity="0.5" />
          ))}
          {/* the feed line — dash crawl gated for reduced motion */}
          <line
            x1="24"
            y1="254"
            x2="776"
            y2="254"
            stroke="#2dd4bf"
            strokeWidth="1.5"
            strokeDasharray="10 14"
            opacity="0.5"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          <text x="400" y="306" textAnchor="middle" fill="#2dd4bf" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            PREDICATE BENCH
          </text>
          {/* satellite glyphs — faint echoes of the five stations, off the rail */}
          {[
            { g: "=", x: -46, y: 34, r: -12 },
            { g: "⊂", x: -58, y: 252, r: 8 },
            { g: "≈", x: 848, y: 172, r: 10 },
            { g: "∈", x: 816, y: 322, r: -8 },
          ].map((s) => (
            <g key={`sat-${s.g}`} transform={`rotate(${s.r} ${s.x} ${s.y})`} opacity="0.4">
              <rect x={s.x - 22} y={s.y - 22} width="44" height="44" rx="7" fill="#2dd4bf06" stroke="#2dd4bf" strokeWidth="1.2" />
              <text x={s.x} y={s.y + 8} textAnchor="middle" fill="#2dd4bf" fontSize="22" fontFamily="ui-monospace, monospace">
                {s.g}
              </text>
            </g>
          ))}
        </motion.svg>

        {/* mid layer: the claims, floating */}
        <motion.div
          className="glass absolute w-[252px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "7%", top: "52%", x: midX, z: 50, rotateY: -6, borderTop: "2px solid #2dd4bf", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono flex gap-2.5 text-[15px] text-teal-300" style={{ textShadow: "0 0 14px #2dd4bf66" }}>
            {GLYPHS.map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
          <div className="mono mt-2 text-[11px] text-slate-300">fixed predicates, no LLM judges</div>
        </motion.div>

        <motion.div
          className="glass absolute w-[280px] rounded-2xl p-4"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "63%", top: "48%", x: midX, z: 0, rotateY: 7, borderTop: "2px solid #2dd4bf", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[11px] leading-relaxed text-slate-300">
            gradecli holds <span className="font-semibold text-teal-300" style={{ textShadow: "0 0 14px #2dd4bf66" }}>zero</span> grading logic — on purpose
          </div>
        </motion.div>

        {/* where this bench sits in the larger move */}
        <motion.div
          className="glass absolute w-[236px] rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "74%", top: "12%", x: midX, z: 59, rotateY: 6, borderTop: "2px solid #2dd4bf", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-teal-300/80 uppercase">sequence</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            step 1 of moving the harness onto pi.dev
          </div>
        </motion.div>

        {/* the discipline this bench shares with its siblings */}
        <motion.div
          className="glass absolute w-[268px] rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "36%", top: "58%", x: midX, z: 23, rotateY: -3, borderTop: "2px solid #2dd4bf", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-teal-300/80 uppercase">lineage</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            the same no-LLM-judge discipline as the board and the crash test
          </div>
        </motion.div>

        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "9%", x: midX, z: 82, rotateY: 3 }}
        >
          <span className="mono text-[10.5px] text-slate-300">
            <span className="breathe" style={{ color: "#2dd4bf" }}>●</span> live + verified
          </span>
        </motion.div>

        {/* the teal ribbon — the one sentence the bench exists to enforce */}
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
          <span className="mono text-[11.5px] text-teal-200">a grade that can't reproduce isn't a grade</span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-teal-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #2dd4bf66" }}>
            pi-eval
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            deterministic grading as a pi package
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-teal-300/50 bg-teal-400/15 px-4 py-2 text-[11.5px] text-teal-200 transition hover:bg-teal-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/pi-eval"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the package
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">{GLYPHS.join(" · ")} — no LLM judges</p>
        </div>
      </motion.div>
    </div>
  );
}
