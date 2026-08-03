import { useEffect, useRef } from "react";

// Ambient drifting specks behind the canvas. Pure decoration — static under
// prefers-reduced-motion, and skipped entirely if canvas is unavailable.
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
      // reduced-motion draws no frames after init — repaint once or a resize
      // leaves the layer blank for good (critic finding)
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        requestAnimationFrame(draw);
      }
    };

    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;

    const HUES = ["34,211,238", "167,139,250", "96,165,250"];
    const specks = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (0.4 + Math.random() * 1.3) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      vy: (Math.random() - 0.5) * 0.12 * dpr,
      hue: HUES[Math.floor(Math.random() * HUES.length)],
      tw: Math.random() * Math.PI * 2,
    }));

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of specks) {
        if (!reduce) {
          s.x = (s.x + s.vx + canvas.width) % canvas.width;
          s.y = (s.y + s.vy + canvas.height) % canvas.height;
        }
        const a = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t / 1400 + s.tw));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.hue},${a})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    addEventListener("resize", fit);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" />;
}
