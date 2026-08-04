import { useEffect, useRef } from "react";
import { useHub } from "../state/hub";
import { DRIFT_IDLE_MS, fieldPointer, useOrrery } from "./orrery";

// The night behind the glass. Three parallax layers share one canvas — a crowd
// of dim, almost-still pinpricks at the back, a sparser mid field, and a few
// bright near stars that drift just fast enough to notice. The rate DIFFERENCE
// between layers is the whole depth illusion; no 3D math, no cost. Still pure
// decoration — static under prefers-reduced-motion, skipped if canvas is
// unavailable — and deliberately quiet: it sits behind glass panels, so if you
// catch yourself watching it, it's too loud.
export default function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      // Resizing clears the canvas, and neither reduced motion nor the 3d
      // sleep below is drawing frames — kick exactly one repaint; draw's own
      // tail decides whether the loop continues (critic finding, extended).
      kick();
    };

    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;

    // Colour TEMPERATURE, not a rainbow: most stars sit just off pure white on
    // the warm or cool side, and a scattered few borrow the app's own teal and
    // violet — enough that the sky belongs to this UI, never so many that it
    // reads as confetti.
    const WARM = "255,241,222";
    const COOL = "214,231,255";
    const ACCENTS = ["34,211,238", "167,139,250"];
    const pickHue = () => {
      const roll = Math.random();
      if (roll < 0.46) return WARM;
      if (roll < 0.92) return COOL;
      return ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    };

    // far → near. Depth is sold three ways at once: nearer stars are fewer,
    // bigger and brighter, AND drift faster — the far field is close to static,
    // so the sheets visibly slide over one another. Speeds are px/frame before
    // dpr, deliberately tiny; ranges inside each layer keep it from looking
    // stamped.
    const LAYERS = [
      { count: 150, rMin: 0.35, rMax: 0.8, aMin: 0.12, aMax: 0.3, speed: 0.006, halo: false },
      { count: 70, rMin: 0.6, rMax: 1.3, aMin: 0.2, aMax: 0.5, speed: 0.028, halo: false },
      { count: 24, rMin: 1.1, rMax: 2.2, aMin: 0.38, aMax: 0.72, speed: 0.07, halo: true },
    ];
    // One shared heading for every layer. Per-star directions read as noise;
    // whole sheets moving the same way at different rates read as parallax.
    const dirX = 0.62;
    const dirY = -0.35;

    interface Star {
      x: number; // fractions of the canvas, so a resize keeps the composition
      y: number;
      r: number;
      a: number;
      hue: string;
      speed: number;
      halo: boolean;
      twAmp: number; // 0 for most stars — only a small subset twinkles
      twPhase: number;
    }
    const stars: Star[] = LAYERS.flatMap((L) =>
      Array.from(
        { length: L.count },
        (): Star => ({
          x: Math.random(),
          y: Math.random(),
          r: L.rMin + Math.random() * (L.rMax - L.rMin),
          a: L.aMin + Math.random() * (L.aMax - L.aMin),
          hue: pickHue(),
          speed: L.speed,
          halo: L.halo,
          twAmp: Math.random() < 0.18 ? 0.35 + Math.random() * 0.35 : 0,
          twPhase: Math.random() * Math.PI * 2,
        })
      )
    );

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let dozeTimer = 0;

    // The sky holds its breath behind an idle 3d field. The stars themselves
    // are free — flat mode holds 60fps with all 244 — but every canvas frame
    // makes the compositor re-raster the tilted stage, measured at 233–250ms
    // a frame under SwiftShader, and this rAF was the only thing forcing
    // frames while nothing moved. So: 3d graph on screen, pointer off both
    // the field and the HUD, drift not eligible to move (the same ledger the
    // drift loop reads) → stop drawing and poll cheaply instead. Motion this
    // slow (0.006–0.07 px/frame) reads as static anyway, and a project room
    // or flat mode — where the sky is actually watchable — never sleeps.
    const asleep = () => {
      const o = useOrrery.getState();
      if (o.flat) return false;
      if (useHub.getState().stage.kind !== "graph") return false;
      if (fieldPointer.overCanvas || fieldPointer.overHud) return false;
      const now = performance.now();
      const driftEligible =
        !useHub.getState().mapLocked &&
        !o.dragging &&
        now - fieldPointer.lastActive > DRIFT_IDLE_MS &&
        now - o.manualAt > DRIFT_IDLE_MS;
      return !driftEligible; // drift moving = frames exist anyway, keep drawing
    };
    const schedule = () => {
      if (asleep()) dozeTimer = window.setTimeout(schedule, 300);
      else raf = requestAnimationFrame(draw);
    };
    // One repaint, then let the tail of draw() re-decide — used at boot and
    // on resize so a sleeping (or reduced-motion) sky never stays blank.
    const kick = () => {
      cancelAnimationFrame(raf);
      clearTimeout(dozeTimer);
      raf = requestAnimationFrame(draw);
    };

    const draw = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!reduce) {
          // fraction-space drift, wrapped at the edges — dividing by the canvas
          // size here is what makes `speed` a true px/frame whatever the window
          s.x = (s.x + (s.speed * dpr * dirX) / w + 1) % 1;
          s.y = (s.y + (s.speed * dpr * dirY) / h + 1) % 1;
        }
        // Slow breathing for the chosen few; everyone else holds steady. Under
        // reduced motion nothing pulses, but the layered brightness — the part
        // that carries the depth — is all still on screen.
        const a =
          s.twAmp > 0 && !reduce
            ? s.a * (1 - s.twAmp * (0.5 + 0.5 * Math.sin(t / 2400 + s.twPhase)))
            : s.a;
        const x = s.x * w;
        const y = s.y * h;
        const r = s.r * dpr;
        if (s.halo) {
          // near stars glow via a cheap wide disc — same read as shadowBlur at
          // none of its per-draw cost
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.hue},${a * 0.18})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.hue},${a})`;
        ctx.fill();
      }
      if (!reduce) schedule();
    };
    addEventListener("resize", fit);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(dozeTimer);
      removeEventListener("resize", fit);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" />;
}
