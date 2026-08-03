import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The tapdodge-engine project world — two runtimes, one seed. The same game
// rules compile twice (javac for Android, TeaVM for the browser), and one day
// the two builds played DIFFERENT games from one seed: 69 differences, while
// every same-runtime test stayed green. A sibling of HarnessWorld/CrashkitWorld:
// CSS perspective + pointer parallax, depth as framer z/rotateY motion styles
// so translateZ survives the animated float. Every printed claim is REAL.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (dash crawl on the replay lanes) and pointer parallax
// are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// x of the divergence marker in lane-SVG space — where the browser build leaves
// the shared trajectory.
const SPLIT_X = 600;

export default function TapdodgeWorld() {
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

  // The tests that were blind to the divergence — two green, one telling the truth.
  const witnesses = [
    {
      key: "determinism",
      lead: "the determinism test stayed green",
      rest: "it ran the engine twice in the SAME runtime",
      dot: "#2dd4bf",
      w: 296, x: "33%", y: "57%", z: 0, tilt: 2, dur: 6,
    },
    {
      key: "golden",
      lead: "a golden file of the JVM trace passed too",
      rest: "the JVM side never moved",
      dot: "#2dd4bf",
      w: 272, x: "66%", y: "48%", z: 15, tilt: 7, dur: 7,
    },
  ];

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

        {/* back layer: two replay lanes receding to a vanishing point — parallel
            until frame 60, where the browser lane visibly leaves the trajectory */}
        <motion.svg
          viewBox="0 0 900 430"
          className="absolute top-[4%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, z: -180, filter: "blur(0.6px) drop-shadow(0 0 14px #60a5fa55)" }}
        >
          {/* one seed feeding both lanes */}
          <circle cx="30" cy="230" r="5" fill="#60a5fa" style={{ filter: "drop-shadow(0 0 8px #60a5fa)" }} />
          <line x1="34" y1="226" x2="60" y2="166" stroke="#60a5fa" strokeWidth="1" opacity="0.4" />
          <line x1="34" y1="234" x2="60" y2="300" stroke="#60a5fa" strokeWidth="1" opacity="0.4" />
          <text x="30" y="258" textAnchor="middle" fill="#60a5fa" opacity="0.6" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="2">
            seed
          </text>

          {/* JVM lane — straight to the vanishing point, it never moved */}
          <polygon points="20,130 860,196 860,214 20,196" fill="#60a5fa08" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />
          <text x="60" y="118" fill="#60a5fa" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="3" opacity="0.9">
            JVM · javac
          </text>
          <path
            d="M60,166 C130,154 180,176 250,163 C330,150 390,178 470,166 C520,158 560,180 600,192 C670,196 750,200 860,205"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1.5"
            strokeDasharray="7 7"
            style={REDUCE ? undefined : { animation: "dashflow 1.1s linear infinite" }}
          />

          {/* browser lane — parallel until the marker, then the lane itself bends away */}
          <path
            d="M20,264 L600,245 C700,242 790,290 860,326 L860,372 C790,330 700,272 600,277 L20,330 Z"
            fill="#60a5fa08"
            stroke="#60a5fa"
            strokeWidth="1.5"
            opacity="0.8"
          />
          <text x="60" y="352" fill="#60a5fa" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="3" opacity="0.9">
            BROWSER · TeaVM
          </text>
          {/* ghost of the lane the browser build should have stayed in */}
          <path d="M600,245 L860,236 M600,277 L860,254" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="4 8" opacity="0.22" />
          <path d="M600,261 L860,245" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="4 8" opacity="0.22" />
          <path
            d="M60,300 C130,288 180,310 250,297 C330,284 390,312 470,298 C520,290 560,276 600,261 C700,257 790,310 860,349"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1.5"
            strokeDasharray="7 7"
            style={REDUCE ? undefined : { animation: "dashflow 1.1s linear infinite" }}
          />

          {/* the divergence marker */}
          <line
            x1={SPLIT_X}
            y1="150"
            x2={SPLIT_X}
            y2="310"
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="3 6"
            opacity="0.5"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          <circle cx={SPLIT_X} cy="261" r="11" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.6" className="breathe" />
          <circle cx={SPLIT_X} cy="261" r="5" fill="#60a5fa" style={{ filter: "drop-shadow(0 0 10px #60a5fa)" }} />
          <text x="560" y="352" textAnchor="middle" fill="#60a5fa" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="2">
            frame 60 · the divergence
          </text>
        </motion.svg>

        {/* mid layer: the count — one seed, 69 differences */}
        <motion.div
          className="glass absolute w-[240px] rounded-2xl p-4"
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "6%", top: "50%", x: midX, z: 30, rotateY: -6, borderTop: "2px solid #60a5fa", boxShadow: "0 20px 60px rgba(96,165,250,.15)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-blue-300/80 uppercase">from one seed</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-blue-300" style={{ textShadow: "0 0 24px #60a5fa66" }}>
            69
          </div>
          <div className="mono mt-2 text-[10px] text-slate-500">differences</div>
        </motion.div>

        {/* mid layer: the tests that were blind to it — both green, both useless here */}
        {witnesses.map((c, i) => (
          <motion.div
            key={c.key}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, i % 2 ? 8 : -8, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: c.w, left: c.x, top: c.y, x: midX, z: c.z, rotateY: c.tilt, borderTop: `2px solid ${c.dot}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
          >
            <div className="mono flex items-start gap-2 text-[10.5px] leading-relaxed">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: c.dot, boxShadow: `0 0 10px ${c.dot}` }} />
              <span className="text-slate-300">
                {c.lead} — <span className="text-slate-500">{c.rest}</span>
              </span>
            </div>
          </motion.div>
        ))}

        {/* the rose beam — the only instrument that saw it */}
        <div
          className="absolute right-[10%] bottom-[23.5%] left-[10%] h-px"
          style={{ transform: "translateZ(40px)", background: "linear-gradient(90deg, transparent, #fb718555 30%, #fb718588 50%, #fb718555 70%, transparent)" }}
        />
        <motion.div
          className="glass absolute bottom-[21%] left-1/2 -translate-x-1/2 rounded-xl border-rose-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 60 }}
        >
          <span className="mono text-[11.5px] text-rose-200">
            only the diff between them <span className="font-semibold text-rose-300" style={{ textShadow: "0 0 14px #fb718566" }}>fails</span>
          </span>
        </motion.div>

        {/* the shipping plate */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "8%", bottom: "8%", x: midX, z: 50 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            live on <span className="font-semibold text-blue-300" style={{ textShadow: "0 0 14px #60a5fa66" }}>Google Play</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(90px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-blue-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #60a5fa66" }}>
            tapdodge-engine
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            one engine, two runtimes, diffed — a same-runtime test cannot see a between-runtime lie
          </p>
          <p className="mono mt-2 text-[10.5px] text-slate-500">
            the rules compile twice — javac for Android, TeaVM for the browser
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-blue-300/50 bg-blue-400/15 px-4 py-2 text-[11.5px] text-blue-200 transition hover:bg-blue-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/seraphlight-studios/tap-dodge-rush/play/"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ play the game
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">two runtimes, one seed</p>
        </div>
      </motion.div>
    </div>
  );
}
