import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The pi-gates project world — the gate. Refusal gates for a second harness
// that halt disallowed work before it happens, and fail closed when they
// cannot tell. A sibling of CrashkitWorld: CSS perspective + pointer parallax
// with layered translateZ depth. Every printed line below is verbatim fact.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (dash crawl, armed-cursor breathe) and pointer
// parallax are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ACCENT = "#fb7185";

export default function PiGatesWorld() {
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

  // The two gate panels — verbatim, do not embellish.
  const panels = [
    {
      key: "source",
      text: "the agent's own typed APPROVE resolves to null — the source is the extension, not the operator",
      w: 288,
      x: "5%",
      y: "47%",
      z: 43,
      tilt: -6,
      dur: 6,
      drift: -8,
    },
    {
      key: "halt",
      text: "they halt work that should not happen, before it happens",
      w: 246,
      x: "71%",
      y: "44%",
      z: 23,
      tilt: 7,
      dur: 7,
      drift: 8,
    },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "2600px", background: "radial-gradient(1100px 600px at 50% 8%, #fb718512, transparent 55%), radial-gradient(900px 700px at 15% 90%, #2dd4bf0d, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding toward the vault */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(251,113,133,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(251,113,133,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the vault door — massive, circular, dimly rose-lit */}
        <motion.svg
          viewBox="0 0 800 800"
          className="absolute top-[0%] left-1/2 w-[640px] -translate-x-1/2 opacity-30"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 18px #fb718555)" }}
        >
          {/* door slab + concentric rings */}
          <circle cx="400" cy="400" r="356" fill="#fb718506" stroke={ACCENT} strokeWidth="2.5" />
          <circle cx="400" cy="400" r="330" fill="none" stroke={ACCENT} strokeWidth="1" opacity="0.35" />
          <circle cx="400" cy="400" r="252" fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0.5" />
          <circle cx="400" cy="400" r="160" fill="#fb718508" stroke={ACCENT} strokeWidth="1.5" opacity="0.7" />
          {/* locking-bar ring — dash crawl gated for reduced motion */}
          <circle
            cx="400"
            cy="400"
            r="290"
            fill="none"
            stroke={ACCENT}
            strokeWidth="1.5"
            strokeDasharray="8 16"
            opacity="0.5"
            style={REDUCE ? undefined : { animation: "dashflow 1.6s linear infinite" }}
          />
          {/* radial bolts on the outer ring, alternating weight */}
          {Array.from({ length: 16 }, (_, i) => (
            <g key={`b${i}`} transform={`rotate(${i * 22.5} 400 400)`}>
              <circle cx="713" cy="400" r={i % 2 ? 5 : 8} fill="#fb718522" stroke={ACCENT} strokeWidth="1.5" opacity={i % 2 ? 0.4 : 0.8} />
              <line x1="686" y1="400" x2="700" y2="400" stroke={ACCENT} strokeWidth="1" opacity="0.3" />
            </g>
          ))}
          {/* spokes between hub and mid ring — the handle wheel */}
          {Array.from({ length: 8 }, (_, i) => (
            <g key={`s${i}`} transform={`rotate(${i * 45} 400 400)`}>
              <line x1="400" y1="248" x2="400" y2="163" stroke={ACCENT} strokeWidth="2" opacity="0.45" />
              <circle cx="400" cy="252" r="6" fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0.6" />
            </g>
          ))}
          {/* center keyhole glyph — the lock is the point */}
          <circle cx="400" cy="372" r="30" fill="#fb718514" stroke={ACCENT} strokeWidth="2.5" opacity="0.9" />
          <path d="M389 396 L378 466 L422 466 L411 396 Z" fill="#fb718514" stroke={ACCENT} strokeWidth="2.5" opacity="0.9" />
        </motion.svg>

        {/* mid layer: the armed banner — a terminal line, the proof of life */}
        <motion.div
          className="glass absolute left-1/2 -translate-x-1/2 rounded-xl px-5 py-2.5"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ top: "24%", x: midX, z: 66, borderLeft: `2px solid ${ACCENT}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <span className="mono text-[11.5px] whitespace-nowrap text-slate-300">
            <span className="text-slate-500">$ </span>
            <span className="text-rose-200" style={{ textShadow: "0 0 14px #fb718566" }}>
              pi-gates 0.2.0 armed: model-gate, git-gate
            </span>
            <span
              className="ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-rose-300/80"
              style={REDUCE ? undefined : { animation: "breathe 1.2s ease-in-out infinite" }}
            />
          </span>
        </motion.div>

        {/* the two gate panels, floating either side of the door */}
        {panels.map((p) => (
          <motion.div
            key={p.key}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, p.drift, 0] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: p.w,
              left: p.x,
              top: p.y,
              x: midX,
              z: p.z,
              rotateY: p.tilt,
              borderTop: `2px solid ${ACCENT}`,
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-rose-300/80 uppercase">refusal gate</div>
            <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">{p.text}</div>
          </motion.div>
        ))}

        {/* the teal ribbon — the failure posture, cutting through the rose world */}
        <div
          className="absolute right-[10%] bottom-[24.5%] left-[10%] h-px"
          style={{ transform: "translateZ(66px)", background: "linear-gradient(90deg, transparent, #2dd4bf55 30%, #2dd4bf88 50%, #2dd4bf55 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[22%] left-1/2 -translate-x-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 99 }}
        >
          <span className="mono text-[11.5px] whitespace-nowrap text-teal-200">
            fail closed when they cannot tell
          </span>
        </motion.div>

        {/* the liveness plate — absence of the banner is itself a signal */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "6%", bottom: "8%", x: midX, z: 82 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            if you do not see the armed line, <span className="text-rose-300">the gates are not running</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-rose-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #fb718566" }}>
            pi-gates
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            refusal gates for a second harness — fail closed
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-rose-300/50 bg-rose-400/15 px-4 py-2 text-[11.5px] text-rose-200 transition hover:bg-rose-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/pi-gates"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the gates
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">model-gate — git-gate — fail closed</p>
        </div>
      </motion.div>
    </div>
  );
}
