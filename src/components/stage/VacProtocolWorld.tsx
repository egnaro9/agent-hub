import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useHub } from "../../state/hub";

// The vac-protocol project world — the registry hall, and the story room for
// the replay gauntlet. VAC: capability claims a stranger can check without
// trusting the claimant — a manifest, sha256-pinned artifacts, declared
// numbers recomputed offline, and the exact commands to re-earn every verdict.
// Every number below is the repo's committed record; the gauntlet panels are
// real 2026-08-14 commits, quoted not embellished.
//
// Framer floats are gated app-wide by MotionConfig reducedMotion="user"; the
// pointer parallax is ours to gate.
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Today's arc — the independent replay ran against a live issuer and refused
// three times, each refusal in a different layer, each fix now public:
const GAUNTLET = [
  {
    layer: "the pin",
    fail: "a pre-push rebase rewrote the code commit under the bundle",
    fix: "re-stamped at the true commit",
  },
  {
    layer: "the dependency graph",
    fail: "a git@main requirement could not coexist with pinned evidence — ResolutionImpossible on a clean runner",
    fix: "no moving refs; the replay installs from the hash-pinned clone",
  },
  {
    layer: "the working tree",
    fail: "the replay's own pip install dirtied the clone; the stamp gate refused a tree it could not attribute",
    fix: "build products ignored — and .gitignore itself joined the stamp paths",
  },
];

export default function VacProtocolWorld() {
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
      style={{ perspective: "1300px", background: "radial-gradient(1100px 600px at 30% 10%, #eab30814, transparent 55%), radial-gradient(900px 700px at 85% 90%, #38bdf80c, transparent 60%)" }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {/* floor grid, receding */}
        <div
          className="absolute right-[-20%] bottom-[-12%] left-[-20%] h-[46%] opacity-25"
          style={{
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            background:
              "linear-gradient(rgba(234,179,8,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(234,179,8,.26) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(transparent, black 35%)",
          }}
        />

        {/* back layer: the registry hall — five issuer plinths feeding the seal */}
        <motion.svg
          viewBox="0 0 900 420"
          className="absolute top-[3%] left-1/2 w-[880px] -translate-x-1/2 opacity-35"
          style={{ x: backX, transform: "translateZ(-297px)", filter: "blur(0.6px) drop-shadow(0 0 14px #eab30855)" }}
        >
          {["certlab", "fleet", "evalmut", "crashkit", "drift"].map((iss, i) => {
            const x = 90 + i * 180;
            return (
              <g key={iss}>
                <rect x={x - 52} y="60" width="104" height="54" rx="8" fill="#eab30808" stroke="#eab308" strokeWidth="1.5" />
                <text x={x} y="92" textAnchor="middle" fill="#fde047" opacity="0.8" fontSize="12" fontFamily="ui-monospace, monospace" letterSpacing="2">
                  {iss.toUpperCase()}
                </text>
                <path d={`M${x},114 C${x},170 450,170 450,222`} fill="none" stroke="#eab308" strokeWidth="1.2" strokeDasharray="6 8" opacity="0.6" style={REDUCE ? undefined : { animation: "dashflow 1.3s linear infinite" }} />
              </g>
            );
          })}
          {/* the seal: pinned, hashed, recomputed */}
          <circle cx="450" cy="272" r="50" fill="#eab30810" stroke="#eab308" strokeWidth="2" />
          <circle cx="450" cy="272" r="36" fill="none" stroke="#eab308" strokeWidth="1" opacity="0.5" />
          <text x="450" y="266" textAnchor="middle" fill="#fde047" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="2">
            sha256
          </text>
          <text x="450" y="284" textAnchor="middle" fill="#fde047" opacity="0.7" fontSize="10.5" fontFamily="ui-monospace, monospace" letterSpacing="1">
            recomputed
          </text>
          <text x="450" y="392" textAnchor="middle" fill="#eab308" opacity="0.55" fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="8">
            REGISTRY HALL
          </text>
        </motion.svg>

        {/* mid layer, left: the registry's shape */}
        <motion.div
          className="glass absolute w-[240px] rounded-2xl p-4"
          animate={REDUCE ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "5%", top: "46%", x: midX, z: 66, rotateY: -6, borderTop: "2px solid #eab308", boxShadow: "0 20px 60px rgba(234,179,8,.14)" }}
        >
          <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">the registry</div>
          <div className="mono mt-1 text-[34px] leading-none font-semibold text-yellow-300" style={{ textShadow: "0 0 24px #eab30866" }}>
            11
          </div>
          <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">
            accepted entries, zero pending — regenerated mechanically from committed HEAD trees, reviewed like code
          </div>
          <div className="mono mt-2.5 text-[10px] leading-relaxed text-slate-500">
            15 tampered fixtures in CI, every one refused — a gate must prove it can block
          </div>
        </motion.div>

        {/* THE STORY — the replay gauntlet, three failures in three layers */}
        <div className="absolute top-[33%] left-[36.5%] w-[56%]" style={{ transform: "translateZ(40px)" }}>
          <div className="mono text-[9px] tracking-[0.3em] whitespace-nowrap text-yellow-300/80 uppercase">the replay gauntlet · three failures, three layers, all public</div>
          <div className="mt-2.5 flex gap-2.5">
            {GAUNTLET.map((s, i) => (
              <motion.div
                key={s.layer}
                className="glass flex-1 rounded-2xl p-3.5"
                animate={REDUCE ? undefined : { y: [0, i % 2 ? 7 : -7, 0] }}
                transition={{ duration: 5.5 + i, repeat: Infinity, ease: "easeInOut" }}
                style={{ borderTop: "2px solid #fb7185", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
              >
                <div className="mono flex items-center gap-2 text-[10px]">
                  <span className="rounded bg-rose-400/15 px-1.5 py-0.5 font-semibold text-rose-300">REFUSED</span>
                  <span className="text-slate-500">{s.layer}</span>
                </div>
                <div className="mono mt-2 text-[10px] leading-relaxed text-slate-400">{s.fail}</div>
                <div className="mono mt-2 text-[10px] leading-relaxed text-teal-300/90">✓ {s.fix}</div>
              </motion.div>
            ))}
          </div>
          <p className="mono mt-2 text-[9.5px] text-slate-600">
            the independent replay downloaded a live issuer's bundle by its pins and re-earned the verdicts — refusing, with the precise reason, until the whole path was honest. every refusal and fix is a public commit.
          </p>
        </div>

        {/* the distinction ribbon — printed on every invocation */}
        <motion.div
          className="glass absolute left-1/2 bottom-[20%] -translate-x-1/2 rounded-xl border-yellow-300/40 px-5 py-2.5"
          animate={REDUCE ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transform: "translateZ(99px)" }}
        >
          <span className="mono text-[11.5px] text-yellow-200">
            structural PASS proves the bundle is <span className="text-yellow-300">internally honest</span> — it is not a replay, and the tool says so on every run
          </span>
        </motion.div>

        {/* front layer: title + actions */}
        <div className="absolute top-[8%] left-[6%]" style={{ transform: "translateZ(148px)" }}>
          <div className="mono text-[10px] tracking-[0.35em] text-yellow-300/80 uppercase">project world</div>
          <h2 className="mono mt-2 text-[44px] leading-none font-semibold tracking-tight text-slate-50" style={{ textShadow: "0 0 40px #eab30866" }}>
            vac-protocol
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-slate-400">
            Verifiable Agent Claims: here is the contract, the evidence, the verifier, and the replay instructions — do not trust us, run it.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              onClick={() => setProjectMode("work")}
              className="mono cursor-pointer rounded-xl border border-yellow-300/50 bg-yellow-400/15 px-4 py-2 text-[11.5px] text-yellow-200 transition hover:bg-yellow-400/30"
            >
              enter the workroom ▸
            </button>
            <a
              href="https://github.com/egnaro9/vac-protocol"
              target="erikhill-out"
              className="mono cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11.5px] text-slate-300 transition hover:bg-white/10"
            >
              → the protocol
            </a>
          </div>
          <p className="mono mt-4 text-[10px] text-slate-600">five evidence profiles = five live issuers</p>
        </div>
      </motion.div>
    </div>
  );
}
