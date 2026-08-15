import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The cast-pipeline project world — the projection room. One terminal
// recording fanned out to every surface: player, GIF, mp4. A sibling of
// CrashkitWorld: CSS perspective + pointer parallax with layered translateZ
// depth. Every printed line below is doctrine from the pipeline itself.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (beam dash crawl, REC breathe) and pointer parallax
// are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The three output screens the source reel projects onto.
const SCREENS = [
  { label: "player", x: 560, y: 84, cy: 130 },
  { label: "GIF", x: 580, y: 254, cy: 300 },
  { label: "mp4", x: 560, y: 424, cy: 470 },
];

export default function CastPipelineWorld() {
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

  // Pipeline doctrine, floating mid-depth — verbatim, do not embellish.
  const panels = [
    { label: "record", text: "record a terminal demo once, fan it out to every surface", w: 252, x: "7%", y: "52%", z: 50, tilt: -6, dur: 5.5 },
    { label: "doctrine", text: "every scene ends on a failure being caught — casts of tests passing are decoration", w: 300, x: "36%", y: "58%", z: 0, tilt: 2, dur: 6.5 },
    { label: "palette", text: "two-layer palette: vars hold hex, tokens name the job", w: 252, x: "70%", y: "14%", z: -16, tilt: -6, dur: 7 },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "1300px", background: "radial-gradient(1200px 640px at 25% 12%, #fb71851e, transparent 55%), radial-gradient(1000px 720px at 80% 88%, #2dd4bf14, transparent 60%), radial-gradient(760px 520px at 62% 36%, #fb718510, transparent 62%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
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
        {/* ceiling grid — the projection booth has a roof too */}
        <div
          className="absolute top-[-10%] right-[-20%] left-[-20%] h-[34%] opacity-[0.13]"
          style={{
            transform: "rotateX(-72deg)",
            transformOrigin: "top",
            background:
              "linear-gradient(rgba(251,113,133,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(251,113,133,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(black, transparent 70%)",
          }}
        />

        {/* back layer: the projection room — one source reel, three diverging beams, three screens */}
        <motion.svg
          viewBox="0 0 800 600"
          className="absolute top-[2%] left-1/2 w-[720px] -translate-x-1/2 opacity-[0.34]"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 18px #fb718555)" }}
        >
          {/* registration marks — the projectionist's test pattern */}
          {[
            [24, 24],
            [776, 24],
            [24, 576],
            [776, 576],
          ].map(([cx, cy]) => (
            <g key={`reg-${cx}-${cy}`} opacity="0.3">
              <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="#fb7185" strokeWidth="1" />
              <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke="#fb7185" strokeWidth="1" />
            </g>
          ))}

          {/* spill light behind the booth — faint rays off the back of the reel */}
          {Array.from({ length: 5 }, (_, i) => (
            <line
              key={`ray${i}`}
              x1="130"
              y1="300"
              x2={130 + 300 * Math.cos(((150 + i * 15) * Math.PI) / 180)}
              y2={300 + 300 * Math.sin(((150 + i * 15) * Math.PI) / 180)}
              stroke="#fb7185"
              strokeWidth="1"
              opacity="0.09"
            />
          ))}

          {/* orbit lines around the reel — the room's quiet geometry */}
          <circle cx="130" cy="300" r="96" fill="none" stroke="#fb7185" strokeWidth="1" opacity="0.18" />
          <circle
            cx="130"
            cy="300"
            r="130"
            fill="none"
            stroke="#fb7185"
            strokeWidth="1"
            strokeDasharray="3 12"
            opacity="0.15"
            style={REDUCE ? undefined : { animation: "dashflow 3.2s linear infinite" }}
          />

          {/* the source: a film reel wound with one recording */}
          <circle cx="130" cy="300" r="62" fill="#fb718508" stroke="#fb7185" strokeWidth="2" />
          <circle cx="130" cy="300" r="46" fill="none" stroke="#fb7185" strokeWidth="1" opacity="0.35" />
          <circle cx="130" cy="300" r="12" fill="none" stroke="#fb7185" strokeWidth="1.5" opacity="0.75" />
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 60} 130 300)`}>
              <circle cx="160" cy="300" r="9" fill="none" stroke="#fb7185" strokeWidth="1.5" opacity="0.6" />
            </g>
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <g key={`t${i}`} transform={`rotate(${i * 30} 130 300)`}>
              <line x1="198" y1="300" x2="206" y2="300" stroke="#fb7185" strokeWidth={i % 3 ? 1 : 2} opacity={i % 3 ? 0.3 : 0.7} />
            </g>
          ))}
          {/* recording light — breathe gated for reduced motion */}
          <g style={REDUCE ? undefined : { animation: "breathe 2.4s ease-in-out infinite" }}>
            <circle cx="96" cy="216" r="5" fill="#fb7185" />
            <text x="110" y="221" fill="#fb7185" fontSize="12" fontFamily="ui-monospace, monospace" letterSpacing="2">
              REC
            </text>
          </g>
          {/* the lens */}
          <circle cx="204" cy="300" r="6" fill="#fb7185" opacity="0.8" />

          {/* the film tail — one strip of frames leaving the reel */}
          <g transform="rotate(-8 210 500)" opacity="0.5">
            <rect x="80" y="482" width="270" height="40" rx="5" fill="#fb718506" stroke="#fb7185" strokeWidth="1.2" />
            {Array.from({ length: 5 }, (_, i) => (
              <rect key={`ff${i}`} x={90 + i * 52} y="492" width="42" height="20" rx="2" fill="none" stroke="#fb7185" strokeWidth="1" opacity="0.5" />
            ))}
            {Array.from({ length: 13 }, (_, i) => (
              <g key={`fp${i}`}>
                <circle cx={92 + i * 20.5} cy="487" r="1.6" fill="#fb7185" opacity="0.55" />
                <circle cx={92 + i * 20.5} cy="517" r="1.6" fill="#fb7185" opacity="0.55" />
              </g>
            ))}
          </g>

          {/* three diverging beams, one per surface */}
          <polygon points="204,294 560,84 560,176 204,306" fill="#fb718512" stroke="#fb7185" strokeWidth="1" opacity="0.3" />
          <polygon points="204,294 580,254 580,346 204,306" fill="#fb718512" stroke="#fb7185" strokeWidth="1" opacity="0.3" />
          <polygon points="204,294 560,424 560,516 204,306" fill="#fb718512" stroke="#fb7185" strokeWidth="1" opacity="0.3" />
          {/* beam centerlines — dash crawl gated for reduced motion */}
          {SCREENS.map((s) => (
            <line
              key={s.label}
              x1="204"
              y1="300"
              x2={s.x}
              y2={s.cy}
              stroke="#fb7185"
              strokeWidth="1.5"
              strokeDasharray="10 14"
              opacity="0.5"
              style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
            />
          ))}

          {/* frames in transit — satellite glyphs riding the beams */}
          <g opacity="0.55">
            <rect x="350" y="180" width="26" height="17" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" transform="rotate(-25 363 188)" />
            <rect x="440" y="139" width="20" height="13" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" transform="rotate(-25 450 145)" />
            <rect x="368" y="291" width="26" height="17" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" />
            <rect x="460" y="294" width="20" height="13" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" />
            <rect x="350" y="401" width="26" height="17" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" transform="rotate(25 363 409)" />
            <rect x="440" y="446" width="20" height="13" rx="2" fill="#fb71850c" stroke="#fb7185" strokeWidth="1" transform="rotate(25 450 452)" />
          </g>

          {/* the three screens */}
          {SCREENS.map((s) => (
            <g key={s.label}>
              <rect x={s.x} y={s.y} width="150" height="92" rx="8" fill="#fb71850a" stroke="#fb7185" strokeWidth="1.5" opacity="0.85" />
              <rect x={s.x + 10} y={s.y + 10} width="130" height="72" rx="4" fill="none" stroke="#fb7185" strokeWidth="1" opacity="0.3" />
              {/* scanlines — the recording playing on every surface */}
              {[0, 1, 2].map((r) => (
                <line
                  key={`sl${r}`}
                  x1={s.x + 18}
                  y1={s.y + 22 + r * 8}
                  x2={s.x + 110 - r * 26}
                  y2={s.y + 22 + r * 8}
                  stroke="#fb7185"
                  strokeWidth="1.5"
                  opacity="0.22"
                />
              ))}
              <text x={s.x + 75} y={s.cy + 5} textAnchor="middle" fill="#fb7185" opacity="0.8" fontSize="14" fontFamily="ui-monospace, monospace" letterSpacing="3">
                {s.label}
              </text>
            </g>
          ))}

          <text x="400" y="580" textAnchor="middle" fill="#fb7185" opacity="0.55" fontSize="17" fontFamily="ui-monospace, monospace" letterSpacing="8">
            PROJECTION ROOM
          </text>
        </motion.svg>

        {/* mid layer: pipeline doctrine, floating */}
        {panels.map((p, i) => (
          <motion.div
            key={p.label}
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
              borderTop: "2px solid #fb7185",
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-rose-300/80 uppercase">{p.label}</div>
            <div className="mono mt-2 text-[11px] leading-relaxed text-slate-300">{p.text}</div>
          </motion.div>
        ))}

        {/* the fan-out ledger — where each artifact actually lands */}
        <motion.div
          className="glass absolute rounded-2xl p-4"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 280, left: "69%", top: "40%", x: midX, z: 40, rotateY: -7, borderTop: "2px solid #fb7185", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-rose-300/80 uppercase">surfaces</div>
          <div className="mono mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-slate-300">
            <div>
              <span className="text-rose-200">.cast</span> → asciinema player + dev.to
            </div>
            <div>
              <span className="text-rose-200">.gif</span> → READMEs, Reddit
            </div>
            <div>
              <span className="text-rose-200">.mp4</span> → LinkedIn — <span className="text-teal-300">~5-10× smaller than the GIF</span>
            </div>
          </div>
        </motion.div>

        {/* the booth tools — the two scripts that make the frames honest */}
        <motion.div
          className="glass absolute rounded-2xl p-4"
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 266, left: "7.5%", bottom: "8%", x: midX, z: 59, rotateY: 6, borderTop: "2px solid #fb7185", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-rose-300/80 uppercase">tooling</div>
          <div className="mono mt-2 text-[10.5px] leading-relaxed text-slate-300">
            <span className="text-rose-200">record.sh</span> auto-sizes the window to the scene's real output
          </div>
          <div className="mono mt-1.5 text-[10.5px] leading-relaxed text-slate-300">
            <span className="text-rose-200">frame.py</span> composites title bar + caption chrome onto every GIF frame
          </div>
        </motion.div>

        {/* the gotcha plate — a renderer scar, kept where it can be seen */}
        <motion.div
          className="glass absolute rounded-xl px-4 py-2.5"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ right: "5%", bottom: "9%", x: midX, z: 82, borderLeft: "2px solid #2dd4bf", boxShadow: "0 16px 40px rgba(0,0,0,.45)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-teal-300/70 uppercase">gotcha</div>
          <div className="mono mt-1 max-w-[34ch] text-[10.5px] leading-relaxed text-slate-400">
            ░ rasterises as a <span className="text-rose-300">SOLID block</span> in agg — empty track uses ·
          </div>
        </motion.div>

        {/* the teal ribbon — the reason the room exists */}
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
          <span className="mono text-[11.5px] text-teal-300">the artifact is the evidence</span>
        </motion.div>

        {/* footer strip — the pipeline in one line */}
        <div className="absolute right-0 bottom-[3%] left-0 text-center" style={{ transform: "translateZ(116px)" }}>
          <span className="mono text-[9px] tracking-[0.3em] whitespace-nowrap text-slate-600">
            record.sh — frame.py — .cast · .gif · .mp4
          </span>
        </div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-rose-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #fb718566" }}>
            cast-pipeline
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            one recording, three surfaces — evidence that travels
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-rose-300/50 bg-rose-400/15 px-4 py-2 text-[11.5px] text-rose-200 transition hover:bg-rose-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/cast-pipeline"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the pipeline
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">one recording, every surface</p>
        </div>
      </motion.div>
    </div>
  );
}
