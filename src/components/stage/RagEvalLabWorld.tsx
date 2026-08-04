import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The rag-eval-lab project world — the lie detector. A RAG pipeline that
// catches planted hallucinations: document lines stream toward a scanner ring
// and the planted lie gets flagged mid-stream. A sibling of CrashkitWorld:
// CSS perspective + pointer parallax with layered translateZ depth. Every
// claim printed below is verbatim from the project record.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (dash crawl on the stream + scanner ring) and pointer
// parallax are our own, so we gate them here. The .breathe class is gated in
// index.css.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Document-line glyphs drifting toward the scanner — thin bars, a text column
// in transit. Positions in the 800x800 back-SVG space; ring center is 520,380.
const STREAM = [
  { x: 20, y: 292, w: 44, o: 0.2 },
  { x: 132, y: 292, w: 68, o: 0.22 },
  { x: 56, y: 318, w: 88, o: 0.5 },
  { x: 174, y: 318, w: 52, o: 0.35 },
  { x: 92, y: 344, w: 64, o: 0.45 },
  { x: 186, y: 344, w: 90, o: 0.3 },
  { x: 48, y: 372, w: 74, o: 0.55 },
  { x: 152, y: 372, w: 46, o: 0.4 },
  { x: 80, y: 400, w: 96, o: 0.45 },
  { x: 206, y: 400, w: 58, o: 0.3 },
  { x: 60, y: 428, w: 60, o: 0.5 },
  { x: 146, y: 428, w: 84, o: 0.35 },
  { x: 106, y: 454, w: 70, o: 0.4 },
  { x: 34, y: 482, w: 62, o: 0.24 },
  { x: 124, y: 482, w: 42, o: 0.2 },
  { x: 68, y: 508, w: 82, o: 0.16 },
];

// Lines that cleared the scanner, exiting stage right.
const CLEARED = [
  { x: 700, y: 330, w: 48, o: 0.2 },
  { x: 664, y: 364, w: 72, o: 0.35 },
  { x: 686, y: 394, w: 56, o: 0.25 },
  { x: 668, y: 424, w: 64, o: 0.28 },
  { x: 706, y: 452, w: 40, o: 0.18 },
];

export default function RagEvalLabWorld() {
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

  // Claims verbatim from the project record — do not embellish.
  const panels = [
    {
      label: "retrieval",
      body: "a from-scratch BM25 that matches the published SciFact baseline — nDCG@10 0.664 vs 0.665",
      color: "#60a5fa",
      w: 262,
      x: "5%",
      y: "50%",
      z: 50,
      tilt: -6,
      dur: 6,
      float: -8,
    },
    {
      label: "detection",
      body: "write a false answer and watch it get caught, word by word",
      color: "#fb7185",
      w: 236,
      x: "38%",
      y: "60%",
      z: 0,
      tilt: 2,
      dur: 7,
      float: 8,
    },
    {
      label: "benchmark",
      body: "hybrid retrieval and a reranker it benchmarks honestly — and shows don't beat BM25 here",
      color: "#60a5fa",
      w: 268,
      x: "69%",
      y: "47%",
      z: 33,
      tilt: 7,
      dur: 5.5,
      float: -7,
    },
    {
      label: "demo",
      body: "the demo pip-installs the real wheel into your browser",
      color: "#60a5fa",
      w: 232,
      x: "73%",
      y: "12%",
      z: 56,
      tilt: 6,
      dur: 6.8,
      float: -6,
    },
    {
      label: "faithfulness",
      body: "faithfulness is now a one-line call to gradecore's grounding_score — a test asserts the two agree exactly",
      color: "#2dd4bf",
      w: 280,
      x: "5%",
      y: "72%",
      z: 76,
      tilt: -4,
      dur: 7.2,
      float: 7,
    },
    {
      label: "eval-history",
      body: "CI posts eval runs to eval-history, tagged with the commit that produced them",
      color: "#60a5fa",
      w: 256,
      x: "70%",
      y: "72%",
      z: 79,
      tilt: 5,
      dur: 6.2,
      float: -8,
    },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{
        perspective: "1300px",
        background:
          "radial-gradient(1200px 640px at 45% 8%, #60a5fa1c, transparent 55%), radial-gradient(1000px 720px at 85% 90%, #2dd4bf12, transparent 60%), radial-gradient(720px 520px at 10% 80%, #60a5fa0c, transparent 60%), radial-gradient(640px 460px at 88% 16%, #fb71850c, transparent 62%)",
      }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-30"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(96,165,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />
        {/* faint overhead dot grid — lab ceiling, fading downward */}
        <div
          className="absolute inset-x-0 top-0 h-[38%] opacity-[0.08]"
          style={{
            background: "radial-gradient(rgba(96,165,250,.9) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
            maskImage: "linear-gradient(black, transparent)",
          }}
        />

        {/* back layer: the document stream and the scanner ring, huge and dim */}
        <motion.svg
          viewBox="0 0 800 800"
          className="absolute top-[-4%] left-1/2 w-[880px] -translate-x-1/2 opacity-[0.34]"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 18px #60a5fa55)" }}
        >
          {/* flow rails — dash crawl carries the stream toward the ring; the
              outer pair is fainter, widening the column */}
          {[
            { y: 310, o: 0.16 },
            { y: 345, o: 0.35 },
            { y: 380, o: 0.35 },
            { y: 415, o: 0.35 },
            { y: 450, o: 0.16 },
          ].map(({ y, o }) => (
            <line
              key={y}
              x1="36"
              y1={y}
              x2="398"
              y2={y}
              stroke="#60a5fa"
              strokeWidth="1.5"
              strokeDasharray="6 18"
              opacity={o}
              style={REDUCE ? undefined : { animation: "dashflow 1.2s linear infinite" }}
            />
          ))}

          {/* document-line glyphs in transit */}
          {STREAM.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height="3" rx="1.5" fill="#60a5fa" opacity={b.o} />
          ))}

          {/* lines that passed, exiting right */}
          {CLEARED.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height="3" rx="1.5" fill="#60a5fa" opacity={b.o} />
          ))}

          {/* the scanner ring */}
          {Array.from({ length: 16 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 22.5} 520 380)`}>
              <line
                x1="654"
                y1="380"
                x2={i % 2 ? 664 : 672}
                y2="380"
                stroke="#60a5fa"
                strokeWidth={i % 2 ? 1 : 2}
                opacity={i % 2 ? 0.3 : 0.7}
              />
            </g>
          ))}
          <circle
            cx="520"
            cy="380"
            r="118"
            fill="#60a5fa06"
            stroke="#60a5fa"
            strokeWidth="1.5"
            strokeDasharray="10 14"
            opacity="0.7"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          <circle cx="520" cy="380" r="88" fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.35" />
          {/* scan line */}
          <line x1="520" y1="296" x2="520" y2="464" stroke="#60a5fa" strokeWidth="1" opacity="0.25" />
          <line x1="436" y1="380" x2="604" y2="380" stroke="#60a5fa" strokeWidth="0.75" opacity="0.15" />
          {/* faint diagonal register lines inside the ring */}
          <line x1="462" y1="322" x2="578" y2="438" stroke="#60a5fa" strokeWidth="0.5" opacity="0.12" />
          <line x1="578" y1="322" x2="462" y2="438" stroke="#60a5fa" strokeWidth="0.5" opacity="0.12" />

          {/* orbit lines + satellite glyphs — instruments holding station
              around the scanner */}
          <circle
            cx="520"
            cy="380"
            r="170"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="0.75"
            strokeDasharray="2 10"
            opacity="0.28"
            style={REDUCE ? undefined : { animation: "dashflow 3.2s linear infinite" }}
          />
          <circle cx="520" cy="380" r="212" fill="none" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="1 14" opacity="0.16" />
          {[-32, 118, 224].map((a, i) => (
            <g key={`sat${i}`} transform={`rotate(${a} 520 380)`}>
              <line x1="676" y1="380" x2="684" y2="380" stroke="#60a5fa" strokeWidth="1" opacity="0.3" />
              <circle cx="690" cy="380" r={i === 1 ? 4 : 5.5} fill="#60a5fa14" stroke="#60a5fa" strokeWidth="1.25" opacity="0.55" />
            </g>
          ))}

          {/* the planted lie — one line caught inside the ring, flagged */}
          <g className="breathe">
            <rect
              x="474"
              y="376"
              width="92"
              height="4"
              rx="2"
              fill="#fb7185"
              style={{ filter: "drop-shadow(0 0 8px #fb7185aa)" }}
            />
            <polyline points="474,340 480,348 492,332" fill="none" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="504" y="346" fill="#fb7185" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="4">
              FLAGGED
            </text>
          </g>

          <text x="520" y="536" textAnchor="middle" fill="#60a5fa" opacity="0.5" fontSize="15" fontFamily="ui-monospace, monospace" letterSpacing="8">
            SCANNER
          </text>
        </motion.svg>

        {/* mid layer: the claim panels, floating */}
        {panels.map((c) => (
          <motion.div
            key={c.label}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, c.float, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: c.w,
              left: c.x,
              top: c.y,
              x: midX,
              z: c.z,
              rotateY: c.tilt,
              borderTop: `2px solid ${c.color}`,
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] uppercase" style={{ color: `${c.color}cc` }}>
              {c.label}
            </div>
            <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">{c.body}</div>
          </motion.div>
        ))}

        {/* the teal beam — the honesty finding cutting through the blue world */}
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
            <span className="text-teal-300">“knowing when a technique doesn't help is the point”</span>
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-blue-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #60a5fa66" }}>
            rag-eval-lab
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            a RAG pipeline that catches planted hallucinations
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-blue-300/50 bg-blue-400/15 px-4 py-2 text-[11.5px] text-blue-200 transition hover:bg-blue-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://egnaro9.github.io/rag-eval-lab/"
              target="_blank"
              rel="noopener"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              ▶ try to fool it
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">from-scratch BM25 — hybrid retrieval — reranker</p>
        </div>
      </motion.div>
    </div>
  );
}
