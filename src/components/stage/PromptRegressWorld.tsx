import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The prompt-regress project world — the merge gate. The eval stack pointed at
// pull requests: run the evals on the PR, diff against the main-branch
// baseline, drop the barrier if the answers got worse. A sibling of
// CrashkitWorld: CSS perspective + pointer parallax with layered translateZ
// depth. Every printed claim is verbatim from the project facts.
//
// Scene density: the back-layer gate carries orbit rings, feature-branch
// stubs feeding the PR rail, and a dim baseline rail with comparator ties —
// the visual of "compares them to the main-branch baseline". Satellite
// glyphs (a pass ring, a blocked ring) hold the corners.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (the dash crawls on the PR + baseline rails) and
// pointer parallax are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GREEN = "#34d399";
const ROSE = "#fb7185";

export default function PromptRegressWorld() {
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

  // The pipeline, stage by stage — each claim verbatim, floating in depth.
  // The baseline and blocks claims are the money lines, so they run bigger.
  const panels = [
    { text: "runs your evals on every pull request", w: 238, x: "5%", y: "54%", z: 50, tilt: -6, dur: 5, accent: GREEN, fs: 11.5, glow: false },
    { text: "compares them to the main-branch baseline", w: 274, x: "30%", y: "66%", z: 20, tilt: 2, dur: 6.5, accent: GREEN, fs: 12.5, glow: false },
    { text: "blocks the merge if the answers got worse", w: 280, x: "65%", y: "50%", z: 76, tilt: 7, dur: 5.5, accent: ROSE, fs: 12.5, glow: true },
    { text: "ships as a GitHub Action", w: 206, x: "71%", y: "13%", z: -16, tilt: -7, dur: 7, accent: GREEN, fs: 11.5, glow: false },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{
        perspective: "1300px",
        background: `radial-gradient(1200px 640px at 30% 8%, ${GREEN}1c, transparent 55%), radial-gradient(900px 700px at 85% 90%, ${ROSE}12, transparent 60%), radial-gradient(760px 420px at 50% 80%, #2dd4bf0d, transparent 65%)`,
      }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[50%] opacity-30"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(52,211,153,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the PR pipeline — commits flowing at a barrier arm, a dim
            baseline rail beneath with comparator ties, main glowing beyond */}
        <motion.svg
          viewBox="0 0 800 420"
          className="absolute top-[3%] left-1/2 w-[860px] -translate-x-1/2 opacity-[0.32]"
          style={{ x: backX, z: -297, filter: `blur(0.6px) drop-shadow(0 0 18px ${GREEN}55)` }}
        >
          {/* orbit rings around the gate — the field the barrier commands */}
          <ellipse cx="500" cy="230" rx="240" ry="140" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.14" />
          <ellipse cx="500" cy="230" rx="292" ry="172" fill="none" stroke={GREEN} strokeWidth="1" strokeDasharray="4 10" opacity="0.1" />

          <text x="400" y="74" textAnchor="middle" fill={GREEN} opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            MERGE GATE
          </text>

          {/* feature-branch stubs feeding the PR rail */}
          <path d="M60,180 C110,180 120,250 170,250" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.28" />
          <circle cx="60" cy="180" r="4" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.35" />
          <path d="M150,312 C200,312 210,250 260,250" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.28" />
          <circle cx="150" cy="312" r="4" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.35" />

          {/* incoming PR rail — dash crawl toward the gate, gated for reduced motion */}
          <line
            x1="30"
            y1="250"
            x2="492"
            y2="250"
            stroke={GREEN}
            strokeWidth="1.5"
            strokeDasharray="6 10"
            opacity="0.55"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />

          {/* three commit dots flowing toward the barrier */}
          {[110, 210, 310].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="250" r="11" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.3" />
              <circle cx={cx} cy="250" r="7" fill={GREEN} opacity="0.9" />
            </g>
          ))}

          {/* one dot held at the barrier — rose ring, rose tick */}
          <circle cx="445" cy="250" r="13" fill="none" stroke={ROSE} strokeWidth="1.5" opacity="0.6" />
          <circle cx="445" cy="250" r="7" fill={GREEN} opacity="0.9" />
          <path d="M431,214 l7,8 l14,-16" fill="none" stroke={ROSE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />

          {/* the barrier arm — post, pivot rings, striped boom lowered across the rail */}
          <circle cx="500" cy="148" r="16" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.3" />
          <circle cx="500" cy="148" r="26" fill="none" stroke={GREEN} strokeWidth="1" strokeDasharray="3 6" opacity="0.2" />
          <line x1="500" y1="140" x2="500" y2="268" stroke={GREEN} strokeWidth="4" opacity="0.8" />
          <circle cx="500" cy="148" r="5" fill={GREEN} opacity="0.9" />
          <line x1="501" y1="150" x2="453" y2="288" stroke={GREEN} strokeWidth="8" strokeLinecap="round" opacity="0.3" />
          <line x1="501" y1="150" x2="453" y2="288" stroke={ROSE} strokeWidth="8" strokeLinecap="round" strokeDasharray="10 10" opacity="0.85" />

          {/* beneath: the main-branch baseline rail, dim, with comparator ties —
              the diff drawn as geometry */}
          <line
            x1="30"
            y1="340"
            x2="492"
            y2="340"
            stroke={GREEN}
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.28"
            style={REDUCE ? undefined : { animation: "dashflow 2.6s linear infinite" }}
          />
          {[110, 210, 310, 445].map((cx) => (
            <g key={cx}>
              <line x1={cx} y1="264" x2={cx} y2="328" stroke={GREEN} strokeWidth="1" strokeDasharray="3 5" opacity="0.2" />
              <circle cx={cx} cy="340" r="5" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.4" />
            </g>
          ))}
          <text x="30" y="366" fill={GREEN} opacity="0.5" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="3">
            baseline
          </text>

          {/* beyond the gate: the main-branch rail, glowing, mile-marked */}
          <line x1="508" y1="250" x2="770" y2="250" stroke={GREEN} strokeWidth="7" opacity="0.18" />
          <line x1="508" y1="250" x2="770" y2="250" stroke={GREEN} strokeWidth="3" opacity="0.9" style={{ filter: `drop-shadow(0 0 8px ${GREEN}aa)` }} />
          {[540, 620, 700].map((cx) => (
            <line key={cx} x1={cx} y1="242" x2={cx} y2="258" stroke={GREEN} strokeWidth="1" opacity="0.3" />
          ))}
          {[580, 660].map((cx) => (
            <circle key={cx} cx={cx} cy="250" r="6" fill={GREEN} />
          ))}
          <text x="770" y="232" textAnchor="end" fill={GREEN} opacity="0.7" fontSize="15" fontFamily="ui-monospace, monospace" letterSpacing="3">
            main
          </text>
        </motion.svg>

        {/* satellite glyph: the pass ring, drifting right of the gate */}
        <motion.svg
          viewBox="0 0 60 60"
          className="absolute w-[52px]"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "9%", top: "35%", x: midX, z: 7, opacity: 0.5 }}
        >
          <circle cx="30" cy="30" r="26" fill="none" stroke={GREEN} strokeWidth="1.5" opacity="0.5" />
          <circle cx="30" cy="30" r="20" fill={`${GREEN}0d`} />
          <path d="M20,30 l7,8 l14,-16" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        </motion.svg>

        {/* satellite glyph: the blocked ring, holding the bottom-left corner */}
        <motion.svg
          viewBox="0 0 60 60"
          className="absolute w-[48px]"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "5%", bottom: "7%", x: midX, z: 13, opacity: 0.45 }}
        >
          <circle cx="30" cy="30" r="26" fill="none" stroke={ROSE} strokeWidth="1.5" opacity="0.6" />
          <circle cx="30" cy="30" r="20" fill={`${ROSE}0d`} />
          <line x1="13" y1="47" x2="47" y2="13" stroke={ROSE} strokeWidth="3" strokeLinecap="round" opacity="0.75" />
        </motion.svg>

        {/* mid layer: the pipeline stages, floating glass panels */}
        {panels.map((p, i) => (
          <motion.div
            key={p.text}
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
              borderTop: `2px solid ${p.accent}`,
              boxShadow: p.glow ? `0 0 30px ${ROSE}22, 0 20px 60px rgba(0,0,0,.5)` : "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="flex gap-1.5">
              {panels.map((_, d) => (
                <div key={d} className="h-1 w-1 rounded-full" style={{ background: d === i ? p.accent : `${GREEN}26` }} />
              ))}
            </div>
            <div className="mono mt-2.5 leading-relaxed text-slate-300" style={{ fontSize: p.fs }}>
              {p.text}
            </div>
          </motion.div>
        ))}

        {/* the gap panel — why this exists at all */}
        <motion.div
          className="glass absolute rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 6.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 300, left: "69%", top: "64%", x: midX, z: 36, rotateY: -5, borderTop: `2px solid ${GREEN}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-emerald-300/80 uppercase">the gap</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            fills a gap the popular eval runner leaves open — no history, no cross-run comparison
          </div>
        </motion.div>

        {/* the teal beam — the self-referential story cutting through the green world */}
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
          <span className="mono text-[11.5px] text-teal-200">it gates these very repos</span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-emerald-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: `0 0 40px ${GREEN}66` }}>
            prompt-regress
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a merge gate that blocks eval regressions
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-emerald-300/50 bg-emerald-400/15 px-4 py-2 text-[11.5px] text-emerald-200 transition hover:bg-emerald-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/prompt-regress"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the action
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">every pull request · main-branch baseline · blocks the merge</p>
        </div>
      </motion.div>
    </div>
  );
}
