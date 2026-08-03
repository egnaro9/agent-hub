import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The eval-history project world — the strata vault. A Postgres service that
// keeps EVERY eval run and answers "what regressed?": memory as sediment, one
// luminous stratum per kept run, and one amber seam where a case broke. A
// sibling of HarnessWorld/CrashkitWorld: CSS perspective + pointer parallax,
// with depth passed as framer z/rotateY motion styles so translateZ survives
// the animated y float. Every printed claim below is REAL.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animation (the seam's breathe) and pointer parallax are our own,
// so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The strata — deeper is older, further back, dimmer. The gap at ~48% is
// deliberate: that's where the regression seam runs.
const STRATA = [
  { top: "21%", z: -250, o: 0.16, inset: "6%", blur: true },
  { top: "27.5%", z: -215, o: 0.2, inset: "3%", blur: true },
  { top: "34%", z: -180, o: 0.26, inset: "5%", blur: false },
  { top: "40.5%", z: -148, o: 0.32, inset: "2%", blur: false },
  { top: "55%", z: -88, o: 0.4, inset: "4%", blur: false },
  { top: "61.5%", z: -60, o: 0.46, inset: "1%", blur: false },
  { top: "68%", z: -34, o: 0.52, inset: "5%", blur: false },
];

export default function EvalHistoryWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #f472b614, transparent 55%), radial-gradient(900px 700px at 85% 90%, #fbbf240e, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(244,114,182,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(244,114,182,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the strata — kept runs stacked into depth like sediment */}
        {STRATA.map((s) => (
          <motion.div
            key={s.top}
            className="absolute h-[3px] rounded-full"
            style={{
              left: s.inset,
              right: s.inset,
              top: s.top,
              x: backX,
              z: s.z,
              opacity: s.o,
              background: "linear-gradient(90deg, transparent, #f472b6cc 14%, #f472b6 50%, #f472b6cc 86%, transparent)",
              boxShadow: "0 0 16px #f472b699, 0 0 44px #f472b633",
              filter: s.blur ? "blur(0.8px)" : undefined,
            }}
          />
        ))}

        {/* the one seam that matters — amber, between the layers above and below */}
        <motion.div className="absolute right-0 left-0" style={{ top: "48%", x: backX, z: -118 }}>
          <div
            className="h-[3px] rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, #fbbf24cc 12%, #fbbf24 50%, #fbbf24cc 88%, transparent)",
              boxShadow: "0 0 18px #fbbf2499, 0 0 48px #fbbf2444",
              animation: REDUCE ? undefined : "breathe 2.4s ease-in-out infinite",
            }}
          />
          <div className="absolute bottom-[6px] left-[64%]">
            <span className="mono text-[10px] tracking-[0.22em] text-amber-300" style={{ textShadow: "0 0 16px #fbbf2488" }}>
              the regression seam
            </span>
            <div className="mt-1 ml-0.5 h-[14px] w-px" style={{ background: "linear-gradient(#fbbf2400, #fbbf24aa)" }} />
          </div>
        </motion.div>

        {/* mid layer: the retention plate — a core sample of kept runs */}
        <motion.div
          className="glass absolute w-[212px] rounded-2xl p-4"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "7%", top: "57%", x: midX, z: 35, rotateY: -6, borderTop: "2px solid #f472b6", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <svg viewBox="0 0 120 44" className="w-[104px]">
            {[
              { y: 0, w: 112, o: 0.9 },
              { y: 9, w: 96, o: 0.7 },
              { y: 18, w: 104, o: 0.52 },
              { y: 27, w: 88, o: 0.38 },
              { y: 36, w: 100, o: 0.26 },
            ].map((b) => (
              <rect key={b.y} x="4" y={b.y} width={b.w} height="5" rx="2.5" fill="#f472b6" opacity={b.o} />
            ))}
          </svg>
          <div className="mono mt-2.5 text-[15px] font-semibold text-pink-300" style={{ textShadow: "0 0 18px #f472b666" }}>
            every run, kept
          </div>
        </motion.div>

        {/* the verdict card — the product's whole reason to exist */}
        <motion.div
          className="glass absolute w-[304px] rounded-2xl p-4"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "34%", top: "47%", x: midX, z: 20, rotateY: 2, borderTop: "2px solid #f472b6", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[12.5px] text-slate-300">
            <span className="text-teal-300">5 cases better</span> · <span className="text-amber-300">1 worse</span> → verdict:{" "}
            <span className="font-semibold text-amber-300" style={{ textShadow: "0 0 18px #fbbf2488" }}>
              regressed
            </span>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[18px] w-[24px] rounded-sm" style={{ background: "#2dd4bf22", borderTop: "2px solid #2dd4bf" }} />
            ))}
            <div className="h-[18px] w-[24px] rounded-sm" style={{ background: "#fbbf2426", borderTop: "2px solid #fbbf24", boxShadow: "0 0 14px #fbbf2455" }} />
          </div>
          <div className="mono mt-2.5 text-[10px] leading-relaxed text-slate-500">it won't let a better average bury the case that broke</div>
        </motion.div>

        {/* the stack plate */}
        <motion.div
          className="glass absolute w-[248px] rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "69%", top: "17%", x: midX, z: -20, rotateY: 7, borderTop: "2px solid #f472b6", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 24 30" className="mt-0.5 w-[20px] shrink-0">
              <ellipse cx="12" cy="5" rx="10" ry="4" fill="#f472b622" stroke="#f472b6" strokeWidth="1.5" />
              <path d="M2,5 v20 a10,4 0 0 0 20,0 v-20" fill="#f472b611" stroke="#f472b6" strokeWidth="1.5" />
              <path d="M2,15 a10,4 0 0 0 20,0" fill="none" stroke="#f472b6" strokeWidth="1" opacity="0.5" />
            </svg>
            <div className="mono text-[11px] leading-relaxed text-slate-300">FastAPI · SQLAlchemy 2.0 · Postgres on Neon</div>
          </div>
        </motion.div>

        {/* the CI chip */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "73%", top: "58%", x: midX, z: 40, rotateY: -4 }}
        >
          <span className="mono text-[10.5px] text-slate-400">
            CI on{" "}
            <span className="font-semibold text-pink-300" style={{ textShadow: "0 0 14px #f472b666" }}>
              PG 16 + 18
            </span>
          </span>
        </motion.div>

        {/* the teal ribbon — another project's CI feeding the vault */}
        <motion.div
          className="glass absolute bottom-[9%] left-1/2 w-[560px] max-w-[92%] -translate-x-1/2 rounded-xl border-teal-300/40 px-5 py-2.5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ z: 60 }}
        >
          <span className="mono text-[10.5px] leading-relaxed text-teal-200">
            rag-eval-lab's CI posts its runs here automatically —{" "}
            <span className="text-teal-300">non-blocking, so the bookkeeping can never redden the suite it books</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(90px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-pink-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #f472b666" }}>
            eval-history
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a database that remembers every run — so a regression has nowhere to hide
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-pink-300/50 bg-pink-400/15 px-4 py-2 text-[11.5px] text-pink-200 transition hover:bg-pink-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://eval-history.onrender.com/docs"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ ask the live API
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">every run, kept</p>
        </div>
      </motion.div>
    </div>
  );
}
