import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The mcp-tools project world — the socket panel. The eval stack exposed to
// agents over MCP: five tools on one server, each backed by a repo doing its
// day job. A sibling of CrashkitWorld: CSS perspective + pointer parallax with
// layered translateZ depth. Every printed claim is verbatim from the facts.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// inline CSS animations (plug-line dash crawl, live-socket breathe) and
// pointer parallax are our own, so we gate them here.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The five sockets on the wall panel, top to bottom. calc is the live one —
// the plug-line arcs in from off-frame and lands there.
const TOOLS = ["calc", "search", "grade_answer", "compare_runs", "board"];

// Plug-line path: enters below the left edge of the viewBox and arcs up to
// the calc socket. Drawn twice — a dim solid base and a bright dash crawl.
const PLUG_PATH = "M -80 700 C 140 690, 30 300, 246 210";

export default function McpToolsWorld() {
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

  // The mid-layer claims — verbatim from the facts, do not embellish.
  const panels = [
    { tag: "the pattern", text: "each tool is a repo doing its day job, exposed over MCP", w: 258, x: "7%", y: "52%", z: 50, tilt: -6, dur: 6 },
    { tag: "calc", text: "agent-graph's AST-sandboxed evaluator is the calc tool", w: 246, x: "40%", y: "58%", z: 0, tilt: 2, dur: 7 },
    { tag: "grade_answer", text: "grade_answer names the sentences your sources don't support", w: 268, x: "66%", y: "20%", z: 33, tilt: 7, dur: 5.5 },
    { tag: "compare_runs", text: "eval-history answers compare_runs — did the latest run regress, per case", w: 280, x: "69%", y: "46%", z: 40, tilt: 6, dur: 6.5 },
    { tag: "board", text: "a fifth tool reads the live board", w: 204, x: "76%", y: "72%", z: 73, tilt: 5, dur: 5 },
    { tag: "claude desktop", text: "wire the server into Claude Desktop and the page's opening line stops being a claim", w: 300, x: "5%", y: "72%", z: 59, tilt: -5, dur: 7.5 },
  ];

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ perspective: "1300px", background: "radial-gradient(1200px 640px at 30% 8%, #a78bfa1f, transparent 55%), radial-gradient(1000px 720px at 85% 90%, #2dd4bf16, transparent 60%), radial-gradient(760px 540px at 52% 42%, #a78bfa10, transparent 62%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-30"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(167,139,250,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.28) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back wall grid — faint, deepest layer, the room the panel is bolted to */}
        <div
          className="absolute top-[-6%] right-[6%] left-[6%] h-[58%] opacity-10"
          style={{
            transform: "translateZ(-396px)",
            background:
              "linear-gradient(rgba(167,139,250,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.5) 1px, transparent 1px)",
            backgroundSize: "68px 68px",
            maskImage: "radial-gradient(58% 78% at 50% 34%, black, transparent 78%)",
          }}
        />

        {/* satellite glyph — a stray socket ring holding the top-right corner */}
        <motion.svg
          viewBox="0 0 200 200"
          className="absolute top-[5%] right-[3%] w-[150px] opacity-20"
          style={{ x: backX, z: -198 }}
        >
          <circle cx="100" cy="100" r="72" fill="none" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" strokeDasharray="3 9" />
          <circle cx="100" cy="100" r="44" fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.8" />
          <circle cx="100" cy="100" r="27" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          <rect x="92" y="88" width="5" height="20" rx="1.5" fill="#a78bfa" opacity="0.7" />
          <rect x="104" y="88" width="5" height="20" rx="1.5" fill="#a78bfa" opacity="0.7" />
          <line x1="100" y1="8" x2="100" y2="24" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          <line x1="100" y1="176" x2="100" y2="192" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          <line x1="8" y1="100" x2="24" y2="100" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          <line x1="176" y1="100" x2="192" y2="100" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
        </motion.svg>

        {/* back layer: the socket panel — five glowing sockets on a wall plate */}
        <motion.svg
          viewBox="0 0 800 800"
          className="absolute top-[-3%] left-1/2 w-[720px] -translate-x-1/2 opacity-[0.34]"
          style={{ x: backX, z: -297, filter: "blur(0.6px) drop-shadow(0 0 20px #a78bfa55)" }}
        >
          {/* wall plate with corner screws */}
          <rect x="252" y="108" width="326" height="582" rx="16" fill="#a78bfa06" stroke="#a78bfa" strokeWidth="2" />
          <rect x="266" y="122" width="298" height="554" rx="10" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.35" />
          {[[272, 128], [558, 128], [272, 670], [558, 670]].map(([sx, sy]) => (
            <circle key={`${sx}-${sy}`} cx={sx} cy={sy} r="4" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.4" />
          ))}
          <text x="415" y="150" textAnchor="middle" fill="#a78bfa" opacity="0.55" fontSize="15" fontFamily="ui-monospace, monospace" letterSpacing="6">
            SOCKET PANEL
          </text>

          {/* the plug-line arcing in from off-frame — dash crawl gated for reduced motion */}
          <path d={PLUG_PATH} fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.3" />
          <path
            d={PLUG_PATH}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeDasharray="8 12"
            opacity="0.8"
            style={REDUCE ? undefined : { animation: "dashflow 1.4s linear infinite" }}
          />
          {/* plug body seated on the live socket */}
          <rect x="246" y="196" width="30" height="28" rx="5" fill="#a78bfa14" stroke="#a78bfa" strokeWidth="1.5" opacity="0.9" />

          {/* conduit runs + junction glyphs — the plate is wired into a wall */}
          <line x1="60" y1="288" x2="252" y2="288" stroke="#a78bfa" strokeWidth="1" opacity="0.3" />
          <rect x="44" y="280" width="16" height="16" rx="3" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.45" />
          <line x1="96" y1="470" x2="252" y2="470" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 6" opacity="0.3" />
          <circle cx="86" cy="470" r="7" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.45" />
          <circle cx="86" cy="470" r="2.5" fill="#a78bfa" opacity="0.5" />
          <line x1="578" y1="332" x2="742" y2="332" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 6" opacity="0.3" />
          <circle cx="750" cy="332" r="6" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.45" />
          {/* the feed leaving the board socket's row — dash crawl gated */}
          <line x1="578" y1="626" x2="726" y2="626" stroke="#a78bfa" strokeWidth="1" opacity="0.3" />
          <line
            x1="578"
            y1="626"
            x2="726"
            y2="626"
            stroke="#a78bfa"
            strokeWidth="1"
            strokeDasharray="4 10"
            opacity="0.55"
            style={REDUCE ? undefined : { animation: "dashflow 2s linear infinite" }}
          />
          <rect x="726" y="618" width="16" height="16" rx="3" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.45" />
          {/* faint range rings radiating off the live socket */}
          <circle cx="310" cy="210" r="58" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.22" />
          <circle cx="310" cy="210" r="82" fill="none" stroke="#a78bfa" strokeWidth="0.75" opacity="0.14" />
          {/* tick ruler along the plate's right rail */}
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={`t${i}`}
              x1="592"
              y1={168 + i * 52}
              x2={i % 5 === 0 ? 612 : 604}
              y2={168 + i * 52}
              stroke="#a78bfa"
              strokeWidth="1"
              opacity="0.35"
            />
          ))}

          {/* the five sockets */}
          {TOOLS.map((t, i) => {
            const cy = 210 + i * 104;
            const live = i === 0;
            return (
              <g key={t}>
                <circle cx="310" cy={cy} r="30" fill="#a78bfa08" stroke="#a78bfa" strokeWidth={live ? 2 : 1.5} opacity={live ? 0.95 : 0.55} />
                <circle cx="310" cy={cy} r="19" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.35" />
                <rect x="303" y={cy - 8} width="4" height="16" rx="1" fill="#a78bfa" opacity={live ? 0.9 : 0.5} />
                <rect x="314" y={cy - 8} width="4" height="16" rx="1" fill="#a78bfa" opacity={live ? 0.9 : 0.5} />
                {live && (
                  <circle
                    cx="310"
                    cy={cy}
                    r="38"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="1.5"
                    opacity="0.6"
                    style={REDUCE ? undefined : { animation: "breathe 2.4s ease-in-out infinite" }}
                  />
                )}
                <text x="362" y={cy + 5} fill="#a78bfa" opacity={live ? 0.9 : 0.6} fontSize="16" fontFamily="ui-monospace, monospace" letterSpacing="2">
                  {t}
                </text>
              </g>
            );
          })}
        </motion.svg>

        {/* mid layer: the claims, floating */}
        {panels.map((c, i) => (
          <motion.div
            key={c.tag}
            className="glass absolute rounded-2xl p-4"
            animate={{ y: [0, i % 2 ? 8 : -8, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: c.w,
              left: c.x,
              top: c.y,
              x: midX,
              z: c.z,
              rotateY: c.tilt,
              borderTop: "2px solid #a78bfa",
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div className="mono text-[9px] tracking-[0.22em] text-violet-300/80 uppercase">{c.tag}</div>
            <div className="mono mt-2 text-[11.5px] leading-relaxed text-slate-300">{c.text}</div>
          </motion.div>
        ))}

        {/* the teal ribbon — the point of the whole panel */}
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
            “an agent that checks its own work before it answers”
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[9%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-violet-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #a78bfa66" }}>
            mcp-tools
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            the eval stack, exposed to agents over MCP
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-violet-300/50 bg-violet-400/15 px-4 py-2 text-[11.5px] text-violet-200 transition hover:bg-violet-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/mcp-tools"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the server
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">calc · search · grade_answer · compare_runs · board</p>
        </div>
      </motion.div>
    </div>
  );
}
