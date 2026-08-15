import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The model-drift project world — "the observatory". A slow radar sweep over
// 16 model blips clustered by lab; every number on the glass is the board's
// real published shape: 16 models, 5 labs, 35 frozen tasks, daily cron,
// 5 deterministic metrics. The rose ribbon is the project's signature insight.

const CX = 450;
const CY = 235;
const rad = (deg: number) => (deg * Math.PI) / 180;

// 16 blips across 5 lab clusters. Positions are decorative and deterministic;
// only the totals (16 / 5) are claims, and they match the live board.
const LABS = [
  { label: "openai", angle: -128, r: 158, count: 4 },
  { label: "anthropic", angle: -52, r: 178, count: 4 },
  { label: "google", angle: 22, r: 128, count: 3 },
  { label: "xai", angle: 96, r: 188, count: 2 },
  { label: "meta", angle: 168, r: 142, count: 3 },
].map((lab) => ({
  ...lab,
  lx: CX + (lab.r + 46) * Math.cos(rad(lab.angle)),
  ly: CY + (lab.r + 46) * Math.sin(rad(lab.angle)),
  blips: Array.from({ length: lab.count }, (_, i) => {
    const a = lab.angle + (i - (lab.count - 1) / 2) * 13;
    const rr = lab.r + (i % 2 === 0 ? -10 : 12);
    return { x: CX + rr * Math.cos(rad(a)), y: CY + rr * Math.sin(rad(a)) };
  }),
}));

export default function ModelDriftWorld() {
  const setProjectMode = useHub((s) => s.setProjectMode);
  const ref = useRef<HTMLDivElement>(null);

  // Framer floats are gated app-wide by MotionConfig reducedMotion="user";
  // the CSS sweep and the pointer parallax are ours to gate.
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 60, damping: 15 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 60, damping: 15 });
  const backX = useSpring(useTransform(mx, [-0.5, 0.5], [44, -44]), { stiffness: 50, damping: 18 });
  const midX = useSpring(useTransform(mx, [-0.5, 0.5], [20, -20]), { stiffness: 50, damping: 18 });

  const onMove = (e: React.PointerEvent) => {
    if (reduced) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  const facts = [
    { k: "the fleet", big: "16 models", sub: "5 labs", w: 200, z: 66, x: "7%", y: "50%", tilt: -6, hot: true },
    { k: "the suite", big: "35 tasks", sub: "frozen · deterministically graded", w: 230, z: 25, x: "26%", y: "66%", tilt: -2, hot: false },
    { k: "scored on", big: "5 metrics", sub: "accuracy · speed · verbosity · reliability · refusal", w: 250, z: 41, x: "58%", y: "56%", tilt: 5, hot: false },
    { k: "the cadence", big: "daily", sub: "cron · public board", w: 180, z: -25, x: "79%", y: "22%", tilt: 8, hot: false },
    // The floor was measured, not assumed: three runs of the identical frozen
    // suite, half an hour apart, moved Sonnet 5 by 9 points while 11 of 16
    // models did not move at all — the spread under any drift signal.
    { k: "the noise floor", big: "9 pts", sub: "three same-day runs of the SAME suite — 11 of 16 models unmoved; a board alerting on one run alerts on sampling", w: 244, z: 8, x: "44%", y: "18%", tilt: 2, hot: false },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{
        perspective: "1300px",
        background:
          "radial-gradient(1100px 600px at 30% 10%, #2dd4bf12, transparent 55%), radial-gradient(900px 700px at 85% 90%, #fb718508, transparent 60%)",
      }}
    >
      <style>{`@keyframes driftsweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(45,212,191,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the observatory — rings, lab clusters, radar sweep */}
        <motion.svg
          viewBox="0 0 900 490"
          className="absolute top-[3%] left-1/2 w-[860px] -translate-x-1/2 opacity-40"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.5px) drop-shadow(0 0 12px #2dd4bf44)" }}
        >
          {[60, 110, 160].map((r) => (
            <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="#2dd4bf" strokeOpacity={0.16} strokeWidth={1} />
          ))}
          <circle cx={CX} cy={CY} r={210} fill="none" stroke="#2dd4bf" strokeOpacity={0.22} strokeWidth={1} strokeDasharray="3 6" />
          <line x1={CX - 210} y1={CY} x2={CX + 210} y2={CY} stroke="#2dd4bf" strokeOpacity={0.08} />
          <line x1={CX} y1={CY - 210} x2={CX} y2={CY + 210} stroke="#2dd4bf" strokeOpacity={0.08} />
          <circle cx={CX} cy={CY} r={4} fill="#2dd4bf" fillOpacity={0.9} />

          {/* the sweep: leading line + trailing wedge, one slow revolution */}
          <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: reduced ? "none" : "driftsweep 14s linear infinite" }}>
            <path d="M450,235 L318.2,78 A205,205 0 0 1 450,30 Z" fill="#2dd4bf" fillOpacity={0.06} />
            <line x1={CX} y1={CY} x2={CX} y2={CY - 205} stroke="#2dd4bf" strokeWidth={1.5} strokeOpacity={0.55} />
            <circle cx={CX} cy={CY - 205} r={3} fill="#2dd4bf" fillOpacity={0.9} />
          </g>

          {LABS.map((lab) => (
            <g key={lab.label}>
              {lab.blips.map((b, i) => (
                <g key={i}>
                  <circle cx={b.x} cy={b.y} r={6.5} fill="none" stroke="#2dd4bf" strokeOpacity={0.25} strokeWidth={1} />
                  <circle className="breathe" cx={b.x} cy={b.y} r={3} fill="#2dd4bf" style={{ animationDelay: `${i * 0.5}s` }} />
                </g>
              ))}
              <text
                x={lab.lx}
                y={lab.ly}
                textAnchor="middle"
                fill="#5eead4"
                fillOpacity={0.75}
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                letterSpacing="3"
              >
                {lab.label.toUpperCase()}
              </text>
            </g>
          ))}
        </motion.svg>

        {/* mid layer: the board's real shape, floating */}
        {facts.map((c, i) => (
          <motion.div
            key={c.k}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, i % 2 ? 9 : -9, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: c.w,
              left: c.x,
              top: c.y,
              x: midX,
              transform: `translateZ(${c.z}px) rotateY(${c.tilt}deg)`,
              borderTop: `2px solid ${c.hot ? "#2dd4bf" : "#2dd4bf66"}`,
              boxShadow: c.hot ? "0 20px 60px rgba(45,212,191,.15)" : "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">{c.k}</div>
            <div
              className="mono mt-1 text-[30px] leading-none font-semibold"
              style={{ color: c.hot ? "#2dd4bf" : "#e2e8f0", textShadow: c.hot ? "0 0 24px #2dd4bf66" : "none" }}
            >
              {c.big}
            </div>
            <div className="mono mt-2 text-[10px] leading-relaxed text-slate-500">{c.sub}</div>
          </motion.div>
        ))}

        {/* the alarm ribbon — the project's signature insight, rose in a teal world */}
        <motion.div
          className="glass absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded-xl border-rose-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)", boxShadow: "0 20px 60px rgba(251,113,133,.12)" }}
        >
          <span className="mono text-[11.5px] text-rose-200">
            alarm: <span className="text-rose-300">same task flips on five providers at once</span> → suspect the harness, not the models
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-teal-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #2dd4bf66" }}>
            model-drift
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a frozen suite, run daily — a score change means the model moved, not the test
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-teal-300/50 bg-teal-400/15 px-4 py-2 text-[11.5px] text-teal-200 transition hover:bg-teal-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/model-drift/"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ open the live board
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">◆ the suite never changes — only the models do</p>
          <p className="mono mt-1.5 text-[10px] text-slate-600">
            ◆ evidence profile no. 5 — the board's standings recompute offline from the committed rows
          </p>
        </div>
      </motion.div>
    </div>
  );
}
