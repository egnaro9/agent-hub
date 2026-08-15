import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The llm-gateway project world — the switchyard. One OpenAI-shaped endpoint
// fronting many providers: traffic arrives on a single inlet rail, clears the
// toll booth, and gets switched onto one of four provider rails. A sibling of
// CrashkitWorld: CSS perspective + pointer parallax with layered translateZ
// depth. Every printed line below is verbatim project copy — nothing invented.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the dash crawl on the rails) and pointer parallax are
// our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Four provider rails fanning off the inlet — unlabelled ghost blocks, each
// with a small load gauge. `needle` is the gauge needle tip, and it sits at a
// different angle per provider on purpose: they are not interchangeable loads.
const RAILS = [
  { y: 110, needle: [-9, -4] },
  { y: 205, needle: [3, -12] },
  { y: 295, needle: [10, -2] },
  { y: 390, needle: [-3, -12] },
] as const;

export default function LlmGatewayWorld() {
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

  // What the gateway actually does — panel copy is verbatim, do not embellish.
  const panels = [
    { text: "one OpenAI-shaped endpoint fronting many providers", w: 240, x: "7%", y: "55%", z: 50, tilt: -6, dur: 5.5 },
    { text: "auth · per-key rate limiting · caching · retries · per-model cost accounting", w: 258, x: "67%", y: "44%", z: 16, tilt: 6, dur: 6.5 },
    { text: "the real ASGI app answers in the demo tab", w: 224, x: "70%", y: "11%", z: -16, tilt: -7, dur: 7 },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 30% 10%, #34d39914, transparent 55%), radial-gradient(900px 700px at 85% 90%, #fbbf240e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(52,211,153,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the switchyard — one inlet rail, a toll booth, four provider rails */}
        <motion.svg
          viewBox="0 0 800 520"
          className="absolute top-[5%] left-1/2 w-[660px] -translate-x-1/2 opacity-30"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 16px #34d39955)" }}
        >
          {/* the inlet — the only way in */}
          <line x1="56" y1="250" x2="280" y2="250" stroke="#34d399" strokeWidth="2.5" opacity="0.8" />
          <line
            x1="56"
            y1="250"
            x2="280"
            y2="250"
            stroke="#a7f3d0"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            opacity="0.9"
            style={REDUCE ? undefined : { animation: "dashflow 1.1s linear infinite" }}
          />

          {/* toll-booth barrier on the inlet — arm raised, but everything passes the booth */}
          <rect x="146" y="250" width="6" height="24" fill="#fbbf24" opacity="0.8" />
          <line x1="149" y1="252" x2="197" y2="207" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" strokeDasharray="8 7" opacity="0.9" />
          <circle cx="149" cy="251" r="3.5" fill="#fbbf24" />

          {/* the fan: inlet switched onto four rails, each ending in a ghost provider block */}
          {RAILS.map((r, i) => (
            <g key={i}>
              <path d={`M280,250 C356,250 392,${r.y} 468,${r.y} L560,${r.y}`} fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0.55" />
              <path
                d={`M280,250 C356,250 392,${r.y} 468,${r.y} L560,${r.y}`}
                fill="none"
                stroke="#a7f3d0"
                strokeWidth="1"
                strokeDasharray="4 8"
                opacity="0.45"
                style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
              />
              {/* unlabelled ghost block — providers are deliberately anonymous back here */}
              <rect x="560" y={r.y - 24} width="136" height="48" rx="7" fill="#34d39908" stroke="#34d399" strokeWidth="1.2" opacity="0.7" />
              {/* its gauge tick */}
              <g transform={`translate(600 ${r.y + 13})`} opacity="0.9">
                <path d="M-15,0 A15,15 0 0 1 15,0" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <line x1="0" y1="0" x2={r.needle[0]} y2={r.needle[1]} stroke="#e2e8f0" strokeWidth="1.5" />
                <circle r="2" fill="#e2e8f0" />
              </g>
            </g>
          ))}

          <text x="400" y="486" textAnchor="middle" fill="#34d399" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            SWITCHYARD
          </text>
        </motion.svg>

        {/* mid layer: what the switchyard actually does, floating */}
        {panels.map((p, i) => (
          <motion.div
            key={i}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, i % 2 ? 8 : -8, 0] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: p.w,
              left: p.x,
              top: p.y,
              x: midX,
              z: p.z,
              rotateY: p.tilt,
              borderTop: "2px solid #34d399",
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[11px] leading-relaxed text-slate-300">{p.text}</div>
          </motion.div>
        ))}

        {/* the amber ribbon — the rate limiter is an invitation, not a footnote */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(66px)", background: "linear-gradient(90deg, transparent, #fbbf2455 30%, #fbbf2488 50%, #fbbf2455 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 -translate-x-1/2 rounded-xl border-amber-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 99 }}
        >
          <span className="mono text-[11.5px] text-amber-200">flood it for a 429</span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-emerald-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #34d39966" }}>
            llm-gateway
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            one endpoint, many providers — governed
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-emerald-300/50 bg-emerald-400/15 px-4 py-2 text-[11.5px] text-emerald-200 transition hover:bg-emerald-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/llm-gateway/"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ poke the API
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
