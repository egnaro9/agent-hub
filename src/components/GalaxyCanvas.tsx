import { useEffect, useRef } from "react";
import { useHub } from "../state/hub";
import { STRUCTURAL } from "../data/mock";
import type { Agent, Project } from "../types";

/* ════════════════════════════════════════════════════════════════════════════
   THE GALAXY MAP — the hub's default spatial view (Phase 1 of the redesign).

   Projects are planets with real surfaces (six seeded archetypes: gas, rock,
   ice, ember, ocean, city — plus one twin), lit by a consistent off-limb sun
   so every body carries a crescent, never an eyeball. Agents are moons
   orbiting the project their ASSIGNMENT names — the store is the single truth
   the map draws, which is exactly the contract the joinRoom fix bought.
   Structural relationships are breathing energy filaments. Everything
   emissive passes through a real additive bloom chain (offscreen → half-res →
   quarter-res blur → lighter), over fbm-baked nebulae, three parallax star
   layers, film grain and a vignette.

   Two projections share the sprites and the bloom: the default 2.5D map, and
   an optional immersive 3D mode (free-orbit camera, planets revolving on
   their cluster rings) behind the HUD's 3D button. The mock this ports from
   lives in the design history; the production 3D mode is earmarked for R3F if
   it outgrows this hand-rolled projection.

   Perf discipline, paid for in the mock: EVERYTHING expensive is baked once —
   nebulae (low-res fbm, upscaled), star tiles, planet sprites, grain — and
   the per-frame path never touches ctx.filter (software-path trap).
   ═══════════════════════════════════════════════════════════════════════════ */

const TAU = Math.PI * 2;
const LIGHT = { x: -0.62, y: -0.72 };
const HOME = { x: 360, y: 190, z: 0.4 };

// ── palette helpers ──────────────────────────────────────────────────────────
const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const rgba = (h: string, a: number) => {
  const [r, g, b] = hex(h);
  return `rgba(${r},${g},${b},${a})`;
};
const mix = (h1: string, h2: string, k: number) => {
  const a = hex(h1), b = hex(h2);
  return `rgb(${a.map((v, i) => Math.round(v * (1 - k) + b[i] * k)).join(",")})`;
};
const desat = (h: string, k: number) => {
  const [r, g, b] = hex(h);
  const l = (r + g + b) / 3;
  return `rgb(${Math.round(r * (1 - k) + l * k)},${Math.round(g * (1 - k) + l * k)},${Math.round(b * (1 - k) + l * k)})`;
};

// Deterministic rng — every bake composes identically on every load.
let seed = 1379;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const idSeed = (id: string) => {
  let h = 2166136261;
  for (const ch of id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
};

// ── cluster + archetype assignments (seed projects; extras join "founded") ──
type Kind = "gas" | "rock" | "ice" | "ember" | "ocean" | "city" | "twin";
const CLUSTER_DEF: { id: string; name: string; cx: number; cy: number; cap: number }[] = [
  { id: "grading", name: "grading core", cx: -40, cy: 40, cap: 120 },
  { id: "harness", name: "harness & agents", cx: 1150, cy: -380, cap: 96 },
  { id: "runtime", name: "runtimes", cx: 1000, cy: 660, cap: 96 },
  { id: "studio", name: "studio", cx: -30, cy: 1010, cap: 80 },
  // Operator-minted projects land here: a young system on the frontier.
  { id: "founded", name: "founded", cx: -700, cy: -520, cap: 80 },
];
const CLUSTER_OF: Record<string, string> = {
  gradecore: "grading", crashkit: "grading", "model-drift": "grading", "rag-eval-lab": "grading",
  "eval-history": "grading", "eval-dashboard": "grading", "prompt-regress": "grading", "pi-eval": "grading",
  "agentic-dev-harness": "harness", "pi-gates": "harness", "harness-builder": "harness",
  "agent-graph": "harness", "mcp-tools": "harness", "llm-gateway": "harness",
  "tapdodge-engine": "runtime", "match3-engine": "runtime", "evals-differential-oracle": "runtime",
  "cast-pipeline": "studio",
};
const KIND_OF: Record<string, Kind> = {
  gradecore: "gas", crashkit: "ember", "model-drift": "gas", "rag-eval-lab": "ocean",
  "eval-history": "rock", "eval-dashboard": "ice", "prompt-regress": "rock", "pi-eval": "ice",
  "agentic-dev-harness": "city", "pi-gates": "rock", "harness-builder": "gas",
  "agent-graph": "city", "mcp-tools": "ice", "llm-gateway": "gas",
  "match3-engine": "rock", "tapdodge-engine": "gas", "evals-differential-oracle": "twin",
  "cast-pipeline": "ocean",
};
const RADIUS_OF: Record<string, number> = {
  gradecore: 46, crashkit: 30, "model-drift": 29, "rag-eval-lab": 24, "eval-history": 21,
  "eval-dashboard": 17, "prompt-regress": 19, "pi-eval": 18, "agentic-dev-harness": 33,
  "pi-gates": 21, "harness-builder": 27, "agent-graph": 20, "mcp-tools": 21, "llm-gateway": 20,
  "match3-engine": 22, "tapdodge-engine": 26, "evals-differential-oracle": 22, "cast-pipeline": 20,
};
const RINGED = new Set(["harness-builder", "tapdodge-engine"]);
const STORMY = new Set(["harness-builder"]);
const FALLBACK_KINDS: Kind[] = ["rock", "ice", "gas", "ocean", "city"];

// ── noise + bakes (ported verbatim from the approved mock) ──────────────────
function makeNoise(sz: number) {
  const g: number[] = [];
  for (let i = 0; i < sz * sz; i++) g.push(rnd());
  const at = (x: number, y: number) => {
    x = ((x % sz) + sz) % sz;
    y = ((y % sz) + sz) % sz;
    return g[(y | 0) * sz + (x | 0)];
  };
  const smooth = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) +
      at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
  return (x: number, y: number) => {
    let f = 0, amp = 0.5, fr = 1;
    for (let o = 0; o < 5; o++) {
      f += smooth(x * fr, y * fr) * amp;
      amp *= 0.55;
      fr *= 2.1;
    }
    return f;
  };
}

function bakeNebula(hue: string, opts: { stretch?: number; gain?: number } = {}) {
  // Small bake, one smoothed upscale: full-res per-pixel fbm is a load hang.
  const S = 140;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const cx2 = c.getContext("2d")!;
  const img = cx2.createImageData(S, S);
  const fbm = makeNoise(48), warp = makeNoise(48);
  const [r, g, b] = hex(hue);
  const stretch = opts.stretch ?? 1.6, gain = opts.gain ?? 1;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = (x / S) * 7 * stretch, ny = (y / S) * 7;
      const w1 = warp(nx * 0.9 + 3.7, ny * 0.9), w2 = warp(nx * 0.9, ny * 0.9 + 8.1);
      let v = fbm(nx + w1 * 2.4, ny + w2 * 2.4);
      v = Math.pow(Math.max(0, v - 0.34) * 1.9, 1.6) * gain;
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const fall = Math.max(0, 1 - (dx * dx + dy * dy) * 3.6);
      v *= fall * fall;
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = Math.min(255, v * 255);
    }
  cx2.putImageData(img, 0, 0);
  const up = document.createElement("canvas");
  up.width = up.height = 560;
  up.getContext("2d")!.drawImage(c, 0, 0, 560, 560);
  return up;
}

function bakeStars(count: number, rMax: number, alpha: number) {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  for (let i = 0; i < count; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.4 + rnd() * rnd() * rMax;
    const a = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = rnd() < 0.18 ? `rgba(255,228,190,${a})` : `rgba(198,220,255,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return c;
}

interface Sprite { c: HTMLCanvasElement; e: HTMLCanvasElement; S: number; R: number }

function bakePlanet(id: string, hue: string, kind: Kind, radius: number): Sprite {
  seed = idSeed(id);
  const R = radius * 2.2, PAD = Math.ceil(R * 0.55), S = Math.ceil((R + PAD) * 2);
  const c = document.createElement("canvas"); c.width = c.height = S;
  const e = document.createElement("canvas"); e.width = e.height = S;
  const g = c.getContext("2d")!, ge = e.getContext("2d")!;
  const cx0 = S / 2, cy0 = S / 2;
  const tilt = (rnd() - 0.5) * 0.8;
  const body = desat(hue, 0.3);
  const fbm = makeNoise(48);

  // Crescent lighting: the bright pole sits on the limb and falls across the
  // whole disc. A bright core centered inside the disc reads as an eyeball.
  const gr = g.createRadialGradient(
    cx0 + LIGHT.x * R * 0.85, cy0 + LIGHT.y * R * 0.85, R * 0.1,
    cx0 + LIGHT.x * R * 0.15, cy0 + LIGHT.y * R * 0.15, R * 2.05
  );
  gr.addColorStop(0, mix(body, "#ffffff", 0.42));
  gr.addColorStop(0.22, mix(body, "#ffffff", 0.1));
  gr.addColorStop(0.5, body);
  gr.addColorStop(0.78, mix(body, "#02030a", 0.55));
  gr.addColorStop(1, mix(body, "#02030a", 0.9));
  g.fillStyle = gr; g.beginPath(); g.arc(cx0, cy0, R, 0, TAU); g.fill();

  g.save(); g.beginPath(); g.arc(cx0, cy0, R, 0, TAU); g.clip();
  g.translate(cx0, cy0); g.rotate(tilt); g.translate(-cx0, -cy0);

  if (kind === "gas") {
    const bands = 6 + Math.floor(rnd() * 7), warm = rnd() < 0.4;
    for (let y = -R; y < R; y += 1.3) {
      const lat = y / R, sq = Math.sqrt(Math.max(0, 1 - lat * lat));
      const wob = fbm(3.5 + lat * 2.8, id.length + lat * 6) * 2.2;
      const tone = Math.sin(lat * bands + wob * 2.2);
      g.fillStyle = tone > 0
        ? `rgba(255,255,255,${0.1 + 0.09 * Math.abs(tone)})`
        : `rgba(4,6,16,${0.14 + 0.13 * Math.abs(tone)})`;
      g.fillRect(cx0 - sq * R, cy0 + y, sq * R * 2, 1.7);
      if (warm && tone > 0.85) {
        g.fillStyle = "rgba(255,220,170,.05)";
        g.fillRect(cx0 - sq * R, cy0 + y, sq * R * 2, 1.7);
      }
    }
    if (STORMY.has(id)) {
      const sxp = cx0 + R * 0.3, syp = cy0 + R * 0.32;
      for (const [ctx2, coreA, size] of [[g, 0.9, 0.3], [ge, 0.65, 0.26]] as const) {
        ctx2.save(); ctx2.translate(sxp, syp); ctx2.rotate(-0.3);
        const st = ctx2.createRadialGradient(0, 0, 0, 0, 0, R * size);
        st.addColorStop(0, `rgba(255,246,225,${coreA})`);
        st.addColorStop(0.45, rgba(mix(hue, "#ffffff", 0.3), coreA * 0.6));
        st.addColorStop(1, "rgba(0,0,0,0)");
        ctx2.fillStyle = st;
        ctx2.beginPath(); ctx2.ellipse(0, 0, R * size, R * size * 0.57, 0, 0, TAU); ctx2.fill();
        ctx2.restore();
      }
    }
  } else if (kind === "rock") {
    for (let i = 0; i < 5; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.7;
      const x = cx0 + Math.cos(a) * rr, y = cy0 + Math.sin(a) * rr, s2 = R * (0.2 + rnd() * 0.35);
      const m = g.createRadialGradient(x, y, 0, x, y, s2);
      m.addColorStop(0, "rgba(5,8,18,.34)"); m.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = m; g.beginPath(); g.arc(x, y, s2, 0, TAU); g.fill();
    }
    const n = 10 + Math.floor(rnd() * 8);
    const la = Math.atan2(LIGHT.y, LIGHT.x);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.88;
      const x = cx0 + Math.cos(a) * rr, y = cy0 + Math.sin(a) * rr, cr = R * (0.045 + rnd() * 0.11);
      g.fillStyle = `rgba(3,5,12,${0.32 + rnd() * 0.2})`;
      g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.22 + rnd() * 0.18})`;
      g.lineWidth = Math.max(0.7, cr * 0.22);
      g.beginPath(); g.arc(x, y, cr * 0.92, la - 1.2, la + 1.2); g.stroke();
      g.strokeStyle = "rgba(2,3,9,.5)"; g.lineWidth = Math.max(0.6, cr * 0.18);
      g.beginPath(); g.arc(x, y, cr * 0.92, la + Math.PI - 1.1, la + Math.PI + 1.1); g.stroke();
    }
    for (let i = 0; i < 160; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.96;
      g.fillStyle = rnd() < 0.5 ? `rgba(3,5,12,${0.05 + rnd() * 0.06})` : `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
      g.beginPath(); g.arc(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr, 0.5 + rnd() * R * 0.02, 0, TAU); g.fill();
    }
  } else if (kind === "ice") {
    g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(cx0 - R, cy0 - R, 2 * R, 2 * R);
    for (const [sgn, al] of [[-1, 0.9], [1, 0.85]] as const) {
      const capY = cy0 + sgn * R * 0.78;
      const cap = g.createRadialGradient(cx0, capY, 0, cx0, capY, R * 0.62);
      cap.addColorStop(0, `rgba(255,255,255,${0.5 * al})`);
      cap.addColorStop(0.6, `rgba(240,250,255,${0.2 * al})`);
      cap.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = cap;
      g.beginPath(); g.ellipse(cx0, capY, R * 0.85, R * 0.42, 0, 0, TAU); g.fill();
    }
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      let x = cx0 + (rnd() - 0.5) * R * 1.4, y = cy0 + (rnd() - 0.5) * R * 1.4;
      let dir = rnd() * TAU;
      g.strokeStyle = `rgba(255,255,255,${0.28 + rnd() * 0.2})`; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        dir += (rnd() - 0.5) * 1.1;
        x += Math.cos(dir) * R * 0.16; y += Math.sin(dir) * R * 0.16;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === "ember") {
    g.fillStyle = "rgba(4,4,10,.62)"; g.fillRect(cx0 - R, cy0 - R, 2 * R, 2 * R);
    const crack = (x: number, y: number, dir: number, depth: number, w: number) => {
      if (depth <= 0) return;
      const segn = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < segn; k++) {
        const nx = x + Math.cos(dir) * R * 0.14, ny = y + Math.sin(dir) * R * 0.14;
        for (const [ctx2, al, lw] of [[g, 0.9, w], [ge, 0.8, w * 1.6]] as const) {
          ctx2.strokeStyle = `rgba(255,${140 + Math.floor(rnd() * 60)},90,${al})`;
          ctx2.lineWidth = lw; ctx2.lineCap = "round";
          ctx2.beginPath(); ctx2.moveTo(x, y); ctx2.lineTo(nx, ny); ctx2.stroke();
        }
        x = nx; y = ny; dir += (rnd() - 0.5) * 0.9;
        if (rnd() < 0.3) crack(x, y, dir + (rnd() < 0.5 ? 1 : -1) * (0.7 + rnd() * 0.6), depth - 1, w * 0.6);
      }
    };
    for (let i = 0; i < 7 + Math.floor(rnd() * 4); i++)
      crack(cx0 + (rnd() - 0.5) * R, cy0 + (rnd() - 0.5) * R, rnd() * TAU, 2, 1.6);
    for (let i = 0; i < 5; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.7;
      const x = cx0 + Math.cos(a) * rr, y = cy0 + Math.sin(a) * rr, s2 = R * (0.05 + rnd() * 0.08);
      for (const [ctx2, al] of [[g, 0.8], [ge, 0.7]] as const) {
        const gl = ctx2.createRadialGradient(x, y, 0, x, y, s2 * 2.2);
        gl.addColorStop(0, `rgba(255,190,120,${al})`); gl.addColorStop(1, "rgba(0,0,0,0)");
        ctx2.fillStyle = gl; ctx2.beginPath(); ctx2.arc(x, y, s2 * 2.2, 0, TAU); ctx2.fill();
      }
    }
  } else if (kind === "ocean") {
    for (let i = 0; i < 8; i++) {
      const y = cy0 - R + rnd() * 2 * R, sw = R * (0.5 + rnd() * 0.9);
      const wob = (rnd() - 0.5) * R * 0.5;
      const lg = g.createLinearGradient(cx0 - sw, y, cx0 + sw, y + wob);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, `rgba(255,255,255,${0.1 + rnd() * 0.1})`);
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.save(); g.translate(cx0, y); g.rotate((rnd() - 0.5) * 0.5);
      g.beginPath(); g.ellipse(0, 0, sw, R * (0.05 + rnd() * 0.06), 0, 0, TAU); g.fill();
      g.restore();
    }
    // elongated glint hugging the lit limb — a centered dot reads as a nipple
    const ga2 = Math.atan2(LIGHT.y, LIGHT.x);
    const sxp = cx0 + Math.cos(ga2) * R * 0.62, syp = cy0 + Math.sin(ga2) * R * 0.62;
    g.save(); g.translate(sxp, syp); g.rotate(ga2 + Math.PI / 2);
    const sp2 = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    sp2.addColorStop(0, "rgba(255,255,255,.55)");
    sp2.addColorStop(0.5, "rgba(255,255,255,.14)");
    sp2.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sp2;
    g.beginPath(); g.ellipse(0, 0, R * 0.42, R * 0.13, 0, 0, TAU); g.fill();
    g.restore();
    ge.save(); ge.translate(sxp, syp); ge.rotate(ga2 + Math.PI / 2);
    ge.fillStyle = "rgba(255,255,255,.35)";
    ge.beginPath(); ge.ellipse(0, 0, R * 0.26, R * 0.07, 0, 0, TAU); ge.fill();
    ge.restore();
  } else if (kind === "city") {
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 0.7;
    for (let i = -3; i <= 3; i++) {
      const yy = cy0 + (i * R) / 3.4;
      const sq = Math.sqrt(Math.max(0, 1 - (i / 3.4) * (i / 3.4))) * R;
      g.beginPath(); g.ellipse(cx0, yy, sq, sq * 0.16, 0, 0, TAU); g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(cx0, cy0, R * Math.abs(Math.cos((i / 7) * Math.PI)), R, 0, 0, TAU);
      g.stroke();
    }
    const da = Math.atan2(-LIGHT.y, -LIGHT.x);
    for (let i = 0; i < 230; i++) {
      const a = da + (rnd() - 0.5) * 2.4, rr = R * (0.3 + Math.sqrt(rnd()) * 0.66);
      const x = cx0 + Math.cos(a) * rr, y = cy0 + Math.sin(a) * rr;
      if ((x - cx0) ** 2 + (y - cy0) ** 2 > R * R * 0.94) continue;
      const al = 0.25 + rnd() * 0.55;
      const col = rnd() < 0.7 ? "255,214,150" : "170,220,255";
      g.fillStyle = `rgba(${col},${al})`;
      g.fillRect(x, y, 0.9 + rnd() * 0.9, 0.9 + rnd() * 0.9);
      ge.fillStyle = `rgba(${col},${al * 0.8})`;
      ge.fillRect(x, y, 1.2, 1.2);
    }
  } else {
    // twin — two implementations, one bright disagreement seam
    const h2 = mix(hue, "#a78bfa", 0.45);
    const half = g.createLinearGradient(cx0 - R, cy0, cx0 + R, cy0);
    half.addColorStop(0, "rgba(0,0,0,0)"); half.addColorStop(0.5, "rgba(0,0,0,0)");
    half.addColorStop(0.5, rgba(h2, 0.5)); half.addColorStop(1, rgba(h2, 0.35));
    g.fillStyle = half; g.fillRect(cx0 - R, cy0 - R, 2 * R, 2 * R);
    for (const side of [-1, 1]) {
      for (let i2 = 0; i2 < 70; i2++) {
        const a = rnd() * Math.PI - Math.PI / 2, rr = Math.sqrt(rnd()) * R * 0.92;
        const y = cy0 + Math.sin(a) * rr;
        const px = cx0 + side * Math.abs(Math.cos(a)) * rr;
        g.fillStyle = side < 0 ? `rgba(255,255,255,${0.05 + rnd() * 0.05})` : `rgba(8,6,18,${0.1 + rnd() * 0.08})`;
        g.beginPath(); g.arc(px, y, 0.6 + rnd() * 1.4, 0, TAU); g.fill();
      }
    }
    for (const [ctx2, al, lw] of [[g, 0.75, 1.2], [ge, 0.7, 2.2]] as const) {
      ctx2.strokeStyle = `rgba(255,255,255,${al})`; ctx2.lineWidth = lw;
      ctx2.beginPath(); ctx2.moveTo(cx0, cy0 - R);
      for (let y = -R; y <= R; y += R / 7) ctx2.lineTo(cx0 + (fbm(4.5, (y / R) * 3 + 9) - 0.5) * R * 0.24, cy0 + y);
      ctx2.stroke();
    }
  }
  g.restore();

  // terminator
  const sg = g.createRadialGradient(
    cx0 - LIGHT.x * R * 1.15, cy0 - LIGHT.y * R * 1.15, R * 0.15,
    cx0 - LIGHT.x * R * 0.4, cy0 - LIGHT.y * R * 0.4, R * 1.75
  );
  sg.addColorStop(0, "rgba(2,3,9,.9)"); sg.addColorStop(0.42, "rgba(2,3,9,.44)"); sg.addColorStop(0.72, "rgba(2,3,9,0)");
  g.save(); g.beginPath(); g.arc(cx0, cy0, R + 0.5, 0, TAU); g.clip();
  g.fillStyle = sg; g.fillRect(0, 0, S, S); g.restore();

  ge.save(); ge.globalCompositeOperation = "destination-in";
  ge.beginPath(); ge.arc(cx0, cy0, R, 0, TAU); ge.fill(); ge.restore();

  // lit-limb arcs, thin and edge-tight
  g.save(); g.beginPath(); g.arc(cx0, cy0, R + 0.4, 0, TAU); g.clip();
  const la2 = Math.atan2(LIGHT.y, LIGHT.x);
  g.strokeStyle = rgba(mix(hue, "#ffffff", 0.6), 0.65); g.lineWidth = 1;
  g.beginPath(); g.arc(cx0, cy0, R - 0.5, la2 - 1.25, la2 + 1.25); g.stroke();
  g.strokeStyle = rgba(mix(hue, "#ffffff", 0.3), 0.18); g.lineWidth = 2.4;
  g.beginPath(); g.arc(cx0, cy0, R - 1.1, la2 - 1.6, la2 + 1.6); g.stroke();
  g.restore();

  return { c, e, S, R };
}

// ── layout ──────────────────────────────────────────────────────────────────
interface GNode {
  x: number; y: number; z: number;
  cluster: (typeof CLUSTER_DEF)[number];
  ringRad: number; ang: number; y3: number; orbSpeed: number;
}
function layout(projects: Project[]) {
  const byCluster = new Map<string, Project[]>();
  projects.forEach((p) => {
    const cid = CLUSTER_OF[p.id] ?? "founded";
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid)!.push(p);
  });
  const nodes = new Map<string, GNode>();
  CLUSTER_DEF.forEach((cl) => {
    const members = byCluster.get(cl.id) ?? [];
    if (members.length === 0) return;
    const sorted = [...members].sort((a, b) => (RADIUS_OF[b.id] ?? 18) - (RADIUS_OF[a.id] ?? 18));
    const zs = [1.06, 1, 0.92, 1.02, 0.88, 0.82, 0.9, 0.78, 0.86];
    sorted.forEach((p, i) => {
      seed = idSeed(p.id) + 7;
      const y3 = (rnd() - 0.5) * 120;
      if (i === 0 && members.length > 1) {
        nodes.set(p.id, { x: cl.cx, y: cl.cy, z: 1.06, cluster: cl, ringRad: 0, ang: 0, y3, orbSpeed: 0 });
        return;
      }
      const ringIdx = members.length === 1 ? 0 : i <= 4 ? 1 : 2;
      const rad = ringIdx === 0 ? 0 : ringIdx === 1 ? 265 : 455;
      const onRing = ringIdx === 1 ? Math.min(4, sorted.length - 1) : sorted.length - 5;
      const slot = ringIdx === 1 ? i - 1 : i - 5;
      const off = ringIdx === 1 ? -0.55 : 0.42;
      const a = off + (slot / Math.max(onRing, 1)) * TAU;
      nodes.set(p.id, {
        x: cl.cx + Math.cos(a) * rad * 1.42, y: cl.cy + Math.sin(a) * rad * 0.72,
        z: zs[i % zs.length], cluster: cl, ringRad: rad, ang: a, y3,
        orbSpeed: rad ? (0.05 + rnd() * 0.04) * (300 / rad) : 0,
      });
    });
  });
  return nodes;
}

// ── the component ───────────────────────────────────────────────────────────
export default function GalaxyCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  // The store is read imperatively inside the frame loop (a canvas repaints
  // itself; React re-renders would only thrash), but label CREATION follows
  // the project list reactively so a minted project gets its planet.
  const projectCount = useHub((s) => s.projects.length);

  useEffect(() => {
    const host = hostRef.current!, view = canvasRef.current!, labelHost = labelsRef.current!;
    const vx = view.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── bakes ──
    const { projects } = useHub.getState();
    const nodes = layout(projects);
    const sprites = new Map<string, Sprite>();
    projects.forEach((p, i) => {
      const kind = KIND_OF[p.id] ?? FALLBACK_KINDS[idSeed(p.id) % FALLBACK_KINDS.length];
      sprites.set(p.id, bakePlanet(p.id, p.hue, kind, RADIUS_OF[p.id] ?? 18 + (i % 4)));
    });
    seed = 1379;
    const NEB = [
      { c: bakeNebula("#1d4ed8", { stretch: 2.2, gain: 0.9 }), x: -350, y: -140, s: 2500, p: 0.34, a: 0.42, dark: false },
      { c: bakeNebula("#0891b2", { stretch: 1.4, gain: 1.05 }), x: -40, y: 60, s: 1750, p: 0.5, a: 0.5, dark: false },
      { c: bakeNebula("#7c3aed", { stretch: 1.8, gain: 0.95 }), x: 1180, y: -420, s: 1600, p: 0.5, a: 0.44, dark: false },
      { c: bakeNebula("#2563eb", { stretch: 1.5, gain: 0.9 }), x: 1020, y: 680, s: 1450, p: 0.5, a: 0.38, dark: false },
      { c: bakeNebula("#be185d", { stretch: 1.3, gain: 0.8 }), x: -40, y: 1050, s: 1150, p: 0.5, a: 0.3, dark: false },
      { c: bakeNebula("#03040a", { stretch: 2.8, gain: 1.25 }), x: 420, y: 180, s: 2300, p: 0.44, a: 0.55, dark: true },
    ];
    const STARL = [
      { c: bakeStars(340, 0.9, 0.5), p: 0.22 },
      { c: bakeStars(200, 1.3, 0.65), p: 0.45 },
      { c: bakeStars(90, 1.9, 0.8), p: 0.75 },
    ];
    const HEROES = Array.from({ length: 13 }, () => ({
      x: (rnd() - 0.5) * 4600, y: (rnd() - 0.5) * 3600,
      s: 0.9 + rnd() * 1.4, p: 0.6 + rnd() * 0.3, tw: rnd() * TAU, warm: rnd() < 0.25,
    }));
    const GRAIN = (() => {
      const S = 160, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d")!, img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const v = Math.floor(rnd() * 255);
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 13;
      }
      g.putImageData(img, 0, 0);
      return c;
    })();
    const em = document.createElement("canvas"), ex = em.getContext("2d")!;
    const bl1 = document.createElement("canvas"), b1 = bl1.getContext("2d")!;
    const bl2 = document.createElement("canvas"), b2 = bl2.getContext("2d")!;

    // ── view state ──
    let W = 0, H = 0;
    const DPR = Math.min(devicePixelRatio || 1, 2);
    const sizeAll = () => {
      W = host.clientWidth; H = host.clientHeight;
      view.width = W * DPR; view.height = H * DPR;
      vx.setTransform(DPR, 0, 0, DPR, 0, 0);
      em.width = W; em.height = H;
      bl1.width = W >> 1 || 1; bl1.height = H >> 1 || 1;
      bl2.width = W >> 2 || 1; bl2.height = H >> 2 || 1;
    };
    sizeAll();
    const ro = new ResizeObserver(sizeAll);
    ro.observe(host);

    const cam = { x: HOME.x, y: HOME.y, z: HOME.z, tx: HOME.x, ty: HOME.y, tz: HOME.z };
    const cam3 = { yaw: 0.6, pitch: 0.42, dist: 2600, tyaw: 0.6, tpitch: 0.42, tdist: 2600,
      target: { x: 520, y: 0, z: 340 }, ttarget: { x: 520, y: 0, z: 340 } };
    const F3 = 980, NEAR = 80;
    let mode: "map" | "3d" = "map";
    let driftOn = !reduced;
    let hoverPause = false;
    let disposed = false;
    const t0 = performance.now();
    let frame = 0, tNow = 0;

    const w2s = (x: number, y: number, p = 1): [number, number] =>
      [(x - cam.x * p) * cam.z + W / 2, (y - cam.y * p) * cam.z + H / 2];

    const pos3 = (id: string) => {
      const n = nodes.get(id)!;
      if (!n.ringRad) return { x: n.cluster.cx, y: n.y3, z: n.cluster.cy };
      const a = n.ang + (reduced ? 0 : tNow * n.orbSpeed);
      return { x: n.cluster.cx + Math.cos(a) * n.ringRad * 1.42, y: n.y3, z: n.cluster.cy + Math.sin(a) * n.ringRad * 1.05 };
    };
    const project3 = (p: { x: number; y: number; z: number }) => {
      const c = cam3, dx = p.x - c.target.x, dy = p.y - c.target.y, dz = p.z - c.target.z;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
      const cp = Math.cos(c.pitch), sp2 = Math.sin(c.pitch);
      const y2 = dy * cp - z1 * sp2, z2 = dy * sp2 + z1 * cp;
      const zc = z2 + c.dist;
      if (zc < NEAR) return null;
      const s2 = F3 / zc;
      return { x: W / 2 + x1 * s2, y: H / 2 + y2 * s2, s: s2, depth: zc };
    };

    // ── labels (DOM) ──
    labelHost.textContent = "";
    const labelEls = new Map<string, HTMLDivElement>();
    projects.forEach((p) => {
      const n = nodes.get(p.id)!;
      const links = STRUCTURAL.filter((e2) => e2.source === p.id || e2.target === p.id).length;
      const d = document.createElement("div");
      d.className = "gal-lab";
      d.dataset.planet = p.id;
      // The RF nodes this replaces were tabbable buttons; a map you cannot
      // keyboard into would be an accessibility regression, not a redesign.
      d.setAttribute("role", "button");
      d.tabIndex = 0;
      d.setAttribute("aria-label", `Open ${p.name}`);
      d.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          useHub.getState().openStage(p.id);
        }
      });
      d.innerHTML =
        `<div class="n">${p.name}</div><div class="rule"></div>` +
        `<div class="m">${n.cluster.name}${links ? ` · ${links} link${links > 1 ? "s" : ""}` : ""}<span class="crew"></span></div>` +
        `<div class="tag">${p.tagline}</div>`;
      d.addEventListener("click", () => useHub.getState().openStage(p.id));
      labelHost.appendChild(d);
      labelEls.set(p.id, d);
    });

    // live agent list per frame — assignment + status straight from the store
    const agentHost = (a: Agent): string | null =>
      useHub.getState().assignments[a.id] ?? null;

    interface MoonState { x: number; y: number; hx: number; hy: number; orb: number; a: number; behind: boolean; host: string | null }
    const moonState = (a: Agent, i: number): MoonState | null => {
      const hostId = agentHost(a);
      if (!hostId || !nodes.has(hostId)) return null;
      const n = nodes.get(hostId)!, sp = sprites.get(hostId)!;
      const [hx, hyRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
      const bob = reduced ? 0 : Math.sin(tNow * 0.12 + n.x * 0.01) * 2.2 * n.z;
      const hy = hyRaw + bob;
      const orb = (sp.R + 18 + i * 3) * cam.z * n.z;
      const a2 = (reduced ? i * 1.9 : tNow * (0.3 + i * 0.05) + i * 1.9);
      return { hx, hy, orb, a: a2, x: hx + Math.cos(a2) * orb * 1.3, y: hy + Math.sin(a2) * orb * 0.5, behind: Math.sin(a2) < 0, host: hostId };
    };

    // ── 2.5D scene ──
    const ringPath = (sx: number, sy: number, R: number, hue: string, back: boolean) => {
      const rx = R * 2.1, ry = R * 0.62;
      vx.save(); vx.translate(sx, sy); vx.rotate(-0.28);
      vx.beginPath();
      if (back) vx.ellipse(0, 0, rx, ry, 0, Math.PI, TAU); else vx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
      const g = vx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, rgba(hue, 0)); g.addColorStop(0.25, rgba(desat(hue, 0.3), 0.5));
      g.addColorStop(0.5, "rgba(255,255,255,.14)"); g.addColorStop(0.75, rgba(desat(hue, 0.3), 0.5));
      g.addColorStop(1, rgba(hue, 0));
      vx.strokeStyle = g; vx.lineWidth = Math.max(1.2, R * 0.14); vx.stroke();
      vx.strokeStyle = "rgba(255,255,255,.10)"; vx.lineWidth = Math.max(0.6, R * 0.05);
      vx.beginPath();
      if (back) vx.ellipse(0, 0, rx * 0.8, ry * 0.8, 0, Math.PI, TAU); else vx.ellipse(0, 0, rx * 0.8, ry * 0.8, 0, 0, Math.PI);
      vx.stroke(); vx.restore();
    };

    const drawMoons = (agents: Agent[], layer: "back" | "front") => {
      agents.forEach((ag, i) => {
        const m = moonState(ag, i);
        if (!m) return;
        if (layer === "back") {
          vx.strokeStyle = rgba(ag.color, 0.15); vx.lineWidth = 0.8;
          vx.beginPath(); vx.ellipse(m.hx, m.hy, m.orb * 1.3, m.orb * 0.5, 0, 0, TAU); vx.stroke();
        }
        if ((layer === "back") !== m.behind) return;
        const talking = ag.status.kind === "talking";
        const mr = Math.max(2.4, 4 * cam.z) * (m.behind ? 0.82 : 1) * (talking ? 1.25 : 1);
        for (let k = 1; k <= 3; k++) {
          const ga3 = m.a - k * 0.09;
          vx.fillStyle = rgba(ag.color, 0.14 * (1 - k / 4));
          vx.beginPath();
          vx.arc(m.hx + Math.cos(ga3) * m.orb * 1.3, m.hy + Math.sin(ga3) * m.orb * 0.5, mr * (1 - k * 0.16), 0, TAU);
          vx.fill();
        }
        vx.fillStyle = mix(ag.color, "#ffffff", m.behind ? 0.05 : talking ? 0.5 : 0.3);
        vx.beginPath(); vx.arc(m.x, m.y, mr, 0, TAU); vx.fill();
      });
    };

    const drawScene = (t: number, agents: Agent[]) => {
      vx.clearRect(0, 0, W, H);
      const bg = vx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#04070f"); bg.addColorStop(0.55, "#04060d"); bg.addColorStop(1, "#060811");
      vx.fillStyle = bg; vx.fillRect(0, 0, W, H);

      vx.save(); vx.textAlign = "center"; vx.textBaseline = "middle";
      CLUSTER_DEF.forEach((cl) => {
        if (![...nodes.values()].some((n) => n.cluster.id === cl.id)) return;
        const [sx, sy] = w2s(cl.cx, cl.cy + 40, 0.92);
        const size = cl.cap * cam.z * 1.9;
        vx.font = `600 ${size}px ui-monospace, Menlo, monospace`;
        // letterSpacing is Chrome-only canvas API; typed loosely on purpose
        const vxl = vx as CanvasRenderingContext2D & { letterSpacing?: string };
        if (vxl.letterSpacing !== undefined) vxl.letterSpacing = `${size * 0.42}px`;
        vx.fillStyle = `rgba(150,185,240,${Math.max(0, 0.05 - Math.abs(cam.z - 0.42) * 0.06)})`;
        vx.fillText(cl.name.toUpperCase(), sx, sy);
      });
      const vxl2 = vx as CanvasRenderingContext2D & { letterSpacing?: string };
      if (vxl2.letterSpacing !== undefined) vxl2.letterSpacing = "0px";
      vx.restore();

      NEB.forEach((n) => {
        const [sx, sy] = w2s(n.x + (reduced ? 0 : Math.sin(t * 0.008 + n.x) * 30), n.y + (reduced ? 0 : Math.cos(t * 0.007 + n.y) * 24), n.p);
        const s = n.s * cam.z;
        vx.globalAlpha = n.a;
        vx.globalCompositeOperation = n.dark ? "source-over" : "screen";
        vx.drawImage(n.c, sx - s / 2, sy - s / 2, s, s);
      });
      vx.globalAlpha = 1; vx.globalCompositeOperation = "source-over";

      STARL.forEach((l) => {
        const s = 1024 * Math.max(cam.z, 0.5) * 1.6;
        const ox = ((-cam.x * l.p * cam.z) % s + s) % s, oy = ((-cam.y * l.p * cam.z) % s + s) % s;
        for (let x = ox - s; x < W; x += s) for (let y = oy - s; y < H; y += s) vx.drawImage(l.c, x, y, s, s);
      });

      CLUSTER_DEF.forEach((cl) => {
        const members = [...nodes.values()].filter((n) => n.cluster.id === cl.id);
        if (members.length < 2) return;
        const [sx, sy] = w2s(cl.cx, cl.cy);
        [265, 455].forEach((rad, i) => {
          if (i === 1 && members.length <= 5) return;
          vx.strokeStyle = `rgba(150,185,240,${i === 0 ? 0.075 : 0.05})`; vx.lineWidth = 1;
          vx.beginPath(); vx.ellipse(sx, sy, rad * 1.42 * cam.z, rad * 0.72 * cam.z, 0, 0, TAU); vx.stroke();
        });
      });

      STRUCTURAL.forEach((edge) => {
        const A = nodes.get(edge.source), B = nodes.get(edge.target);
        if (!A || !B) return;
        const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const sway = reduced ? 0 : Math.sin(t * 0.22 + len * 0.02) * len * 0.02;
        const cxp = mx - (dy / len) * (len * 0.13 + sway), cyp = my + (dx / len) * (len * 0.13 + sway);
        const hueA = useHub.getState().projects.find((p) => p.id === edge.source)?.hue ?? "#60a5fa";
        const hueB = useHub.getState().projects.find((p) => p.id === edge.target)?.hue ?? "#60a5fa";
        const g1 = vx.createLinearGradient(ax, ay, bx, by);
        g1.addColorStop(0, "rgba(0,0,0,0)"); g1.addColorStop(0.12, rgba(hueA, 0.1));
        g1.addColorStop(0.5, "rgba(160,190,240,.07)"); g1.addColorStop(0.88, rgba(hueB, 0.1));
        g1.addColorStop(1, "rgba(0,0,0,0)");
        vx.strokeStyle = g1; vx.lineWidth = 5.5 * cam.z;
        vx.beginPath(); vx.moveTo(ax, ay); vx.quadraticCurveTo(cxp, cyp, bx, by); vx.stroke();
        const g2 = vx.createLinearGradient(ax, ay, bx, by);
        g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(0.15, rgba(hueA, 0.34));
        g2.addColorStop(0.5, "rgba(190,215,250,.22)"); g2.addColorStop(0.85, rgba(hueB, 0.34));
        g2.addColorStop(1, "rgba(0,0,0,0)");
        vx.strokeStyle = g2; vx.lineWidth = Math.max(0.7, 0.9 * cam.z);
        vx.beginPath(); vx.moveTo(ax, ay); vx.quadraticCurveTo(cxp, cyp, bx, by); vx.stroke();
      });

      drawMoons(agents, "back");
      const order = [...nodes.entries()].sort((a, b) => a[1].z - b[1].z);
      order.forEach(([id, n]) => {
        const sp = sprites.get(id)!;
        const p = useHub.getState().projects.find((pp) => pp.id === id)!;
        const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        const bob = reduced ? 0 : Math.sin(t * 0.12 + n.x * 0.01) * 2.2 * n.z;
        const sy = syRaw + bob;
        const scale = cam.z * n.z, drawS = sp.S * scale;
        if (sx < -drawS || sx > W + drawS || sy < -drawS || sy > H + drawS) return;
        const dim = 0.55 + (0.45 * Math.min(n.z, 1.06)) / 1.06;
        if (RINGED.has(id)) ringPath(sx, sy, sp.R * scale, p.hue, true);
        vx.globalAlpha = dim;
        vx.drawImage(sp.c, sx - drawS / 2, sy - drawS / 2, drawS, drawS);
        vx.globalAlpha = 1;
        if (RINGED.has(id)) ringPath(sx, sy, sp.R * scale, p.hue, false);
      });
      drawMoons(agents, "front");
    };

    const drawEmissive = (t: number, agents: Agent[]) => {
      ex.clearRect(0, 0, W, H);
      nodes.forEach((n, id) => {
        const sp = sprites.get(id)!;
        const p = useHub.getState().projects.find((pp) => pp.id === id)!;
        const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        const bob = reduced ? 0 : Math.sin(t * 0.12 + n.x * 0.01) * 2.2 * n.z;
        const sy = syRaw + bob;
        const R = sp.R * cam.z * n.z;
        const g = ex.createRadialGradient(sx, sy, R * 0.72, sx, sy, R * 2.1);
        g.addColorStop(0, rgba(p.hue, 0.2)); g.addColorStop(0.4, rgba(p.hue, 0.07)); g.addColorStop(1, rgba(p.hue, 0));
        ex.fillStyle = g; ex.beginPath(); ex.arc(sx, sy, R * 2.1, 0, TAU); ex.fill();
        const hx2 = sx + LIGHT.x * R * 0.62, hy2 = sy + LIGHT.y * R * 0.62;
        const h = ex.createRadialGradient(hx2, hy2, 0, hx2, hy2, R * 0.85);
        h.addColorStop(0, rgba(mix(p.hue, "#ffffff", 0.7), 0.34)); h.addColorStop(1, "rgba(0,0,0,0)");
        ex.fillStyle = h; ex.beginPath(); ex.arc(hx2, hy2, R * 0.85, 0, TAU); ex.fill();
        const es = sp.S * cam.z * n.z;
        ex.drawImage(sp.e, sx - es / 2, sy - es / 2, es, es);
      });
      STRUCTURAL.forEach((edge, i) => {
        const A = nodes.get(edge.source), B = nodes.get(edge.target);
        if (!A || !B) return;
        const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const cxp = mx - (dy / len) * len * 0.13, cyp = my + (dx / len) * len * 0.13;
        const hueB = useHub.getState().projects.find((p) => p.id === edge.target)?.hue ?? "#60a5fa";
        for (let k = 0; k < 2; k++) {
          const u = reduced ? (i * 0.37 + k * 0.5) % 1 : (t * 0.09 + i * 0.19 + k * 0.5) % 1;
          const px = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cxp + u * u * bx;
          const py = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cyp + u * u * by;
          ex.globalAlpha = Math.sin(u * Math.PI) * 0.9;
          ex.fillStyle = rgba(mix(hueB, "#ffffff", 0.4), 0.9);
          ex.beginPath(); ex.arc(px, py, 1.7 * Math.max(cam.z, 0.55), 0, TAU); ex.fill();
        }
      });
      ex.globalAlpha = 1;
      agents.forEach((ag, i) => {
        const m = moonState(ag, i);
        if (!m) return;
        const talking = ag.status.kind === "talking";
        const g = ex.createRadialGradient(m.x, m.y, 0, m.x, m.y, 11 * cam.z + 5);
        g.addColorStop(0, rgba(ag.color, m.behind ? 0.35 : talking ? 1 : 0.9));
        g.addColorStop(1, rgba(ag.color, 0));
        ex.fillStyle = g; ex.beginPath(); ex.arc(m.x, m.y, 11 * cam.z + 5, 0, TAU); ex.fill();
      });
      HEROES.forEach((hs) => {
        const [sx, sy] = w2s(hs.x, hs.y, hs.p);
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return;
        const tw = reduced ? 0.8 : 0.6 + 0.4 * Math.sin(t * 1.4 + hs.tw);
        const col = hs.warm ? "255,224,178" : "205,225,255";
        const s = hs.s * (1.1 + cam.z * 0.5) * tw;
        const g = ex.createRadialGradient(sx, sy, 0, sx, sy, s * 7);
        g.addColorStop(0, `rgba(${col},.95)`); g.addColorStop(0.2, `rgba(${col},.30)`); g.addColorStop(1, `rgba(${col},0)`);
        ex.fillStyle = g; ex.beginPath(); ex.arc(sx, sy, s * 7, 0, TAU); ex.fill();
        ex.strokeStyle = `rgba(${col},${0.5 * tw})`; ex.lineWidth = 0.8;
        ex.beginPath();
        ex.moveTo(sx - s * 8, sy); ex.lineTo(sx + s * 8, sy);
        ex.moveTo(sx, sy - s * 8); ex.lineTo(sx, sy + s * 8);
        ex.stroke();
      });
    };

    const bloom = () => {
      b1.clearRect(0, 0, bl1.width, bl1.height);
      b1.filter = "blur(3px)";
      b1.drawImage(em, 0, 0, bl1.width, bl1.height);
      b2.clearRect(0, 0, bl2.width, bl2.height);
      b2.filter = "blur(6px)";
      b2.drawImage(bl1, 0, 0, bl2.width, bl2.height);
      vx.save();
      vx.globalCompositeOperation = "lighter";
      vx.globalAlpha = 0.85; vx.drawImage(em, 0, 0, W, H);
      vx.globalAlpha = 0.75; vx.drawImage(bl1, 0, 0, W, H);
      vx.globalAlpha = 0.85; vx.drawImage(bl2, 0, 0, W, H);
      vx.restore();
    };

    const post = () => {
      const v = vx.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.34, W / 2, H * 0.5, Math.max(W, H) * 0.78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(2,3,8,.5)");
      vx.fillStyle = v; vx.fillRect(0, 0, W, H);
      const ox = ((frame % 3) * 53) % 160, oy = ((frame % 7) * 31) % 160;
      vx.globalAlpha = 0.5;
      for (let x = -ox; x < W; x += 160) for (let y = -oy; y < H; y += 160) vx.drawImage(GRAIN, x, y);
      vx.globalAlpha = 1;
    };

    const positionLabels = (agents: Agent[]) => {
      const assignments = useHub.getState().assignments;
      nodes.forEach((n, id) => {
        const el = labelEls.get(id);
        if (!el) return;
        const sp = sprites.get(id)!;
        if (mode === "3d") {
          const pr = project3(pos3(id));
          if (!pr) { el.style.opacity = "0"; return; }
          el.style.left = `${pr.x}px`;
          el.style.top = `${pr.y + sp.R * pr.s * 2.1 + 10}px`;
          el.style.opacity = `${Math.min(1, pr.s * 2.2)}`;
        } else {
          const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
          const below = RINGED.has(id) ? sp.R * 2.15 : sp.R * 1.02;
          el.style.left = `${Math.round(sx)}px`;
          el.style.top = `${Math.round(syRaw + below * cam.z * n.z + 13)}px`;
          el.style.opacity = `${cam.z < 0.3 ? 0 : Math.min(1, (cam.z - 0.28) * 6) * (0.55 + 0.45 * n.z)}`;
        }
        const crewNames = agents.filter((a) => assignments[a.id] === id).map((a) => a.name);
        const crewEl = el.querySelector<HTMLSpanElement>(".crew")!;
        crewEl.textContent = crewNames.length ? ` · ${crewNames.length} crew` : "";
        if (crewNames.length) el.title = crewNames.map((nm) => `${nm} is working here`).join(", ");
        else el.removeAttribute("title");
      });
    };

    const draw3D = (agents: Agent[]) => {
      vx.clearRect(0, 0, W, H); ex.clearRect(0, 0, W, H);
      const bg = vx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#04070f"); bg.addColorStop(0.55, "#04060d"); bg.addColorStop(1, "#060811");
      vx.fillStyle = bg; vx.fillRect(0, 0, W, H);
      NEB.forEach((n2) => {
        const sx = (((n2.x * 0.4 - cam3.yaw * 640 * n2.p) % (W + 1600)) + W + 1600) % (W + 1600) - 800;
        const sy = H * 0.5 + (n2.y * 0.25 - cam3.pitch * 300) * n2.p;
        vx.globalAlpha = n2.a * 0.8;
        vx.globalCompositeOperation = n2.dark ? "source-over" : "screen";
        vx.drawImage(n2.c, sx - n2.s * 0.35, sy - n2.s * 0.35, n2.s * 0.7, n2.s * 0.7);
      });
      vx.globalAlpha = 1; vx.globalCompositeOperation = "source-over";
      STARL.forEach((l) => {
        const s2 = 1024 * 1.4;
        const ox = ((-cam3.yaw * 900 * l.p) % s2 + s2) % s2, oy = ((-cam3.pitch * 500 * l.p) % s2 + s2) % s2;
        for (let x = ox - s2; x < W; x += s2) for (let y = oy - s2; y < H; y += s2) vx.drawImage(l.c, x, y, s2, s2);
      });
      vx.globalCompositeOperation = "lighter";
      CLUSTER_DEF.forEach((cl) => {
        const members = [...nodes.values()].filter((n) => n.cluster.id === cl.id);
        if (members.length < 2) return;
        [265, 455].forEach((rad, ri) => {
          if (ri === 1 && members.length <= 5) return;
          vx.strokeStyle = "rgba(120,160,230,.10)"; vx.lineWidth = 1;
          vx.beginPath();
          let started = false;
          for (let k = 0; k <= 72; k++) {
            const a = (k / 72) * TAU;
            const pr = project3({ x: cl.cx + Math.cos(a) * rad * 1.42, y: 0, z: cl.cy + Math.sin(a) * rad * 1.05 });
            if (!pr) { started = false; continue; }
            if (!started) { vx.moveTo(pr.x, pr.y); started = true; } else vx.lineTo(pr.x, pr.y);
          }
          vx.stroke();
        });
      });
      STRUCTURAL.forEach((edge) => {
        const A = nodes.get(edge.source), B = nodes.get(edge.target);
        if (!A || !B) return;
        const pa = pos3(edge.source), pb = pos3(edge.target);
        vx.strokeStyle = "rgba(150,185,240,.10)"; vx.lineWidth = 1;
        vx.beginPath();
        let started = false;
        for (let k = 0; k <= 24; k++) {
          const u = k / 24;
          const pr = project3({ x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u - Math.sin(u * Math.PI) * 140, z: pa.z + (pb.z - pa.z) * u });
          if (!pr) { started = false; continue; }
          if (!started) { vx.moveTo(pr.x, pr.y); started = true; } else vx.lineTo(pr.x, pr.y);
        }
        vx.stroke();
      });
      vx.globalCompositeOperation = "source-over";
      type Item = { kind: "planet"; id: string; pr: NonNullable<ReturnType<typeof project3>> } |
                  { kind: "moon"; ag: Agent; pr: NonNullable<ReturnType<typeof project3>> };
      const items: Item[] = [];
      nodes.forEach((_n, id) => {
        const pr = project3(pos3(id));
        if (pr) items.push({ kind: "planet", id, pr });
      });
      agents.forEach((ag, i) => {
        const hostId = agentHost(ag);
        if (!hostId || !nodes.has(hostId)) return;
        const hp = pos3(hostId), sp = sprites.get(hostId)!;
        const a = (reduced ? i * 1.9 : tNow * (0.35 + i * 0.06) + i * 1.9), inc = 0.5 + i * 0.13;
        const orbR = sp.R * 1.9 + 26 + i * 6;
        const pr = project3({
          x: hp.x + Math.cos(a) * orbR,
          y: hp.y + Math.sin(a) * Math.sin(inc) * orbR * 0.8,
          z: hp.z + Math.sin(a) * Math.cos(inc) * orbR,
        });
        if (pr) items.push({ kind: "moon", ag, pr });
      });
      items.sort((p, q) => q.pr.depth - p.pr.depth);
      items.forEach((it) => {
        if (it.kind === "planet") {
          const sp = sprites.get(it.id)!;
          const p = useHub.getState().projects.find((pp) => pp.id === it.id)!;
          const d = sp.S * it.pr.s * 2.1;
          vx.drawImage(sp.c, it.pr.x - d / 2, it.pr.y - d / 2, d, d);
          ex.drawImage(sp.e, it.pr.x - d / 2, it.pr.y - d / 2, d, d);
          const R = sp.R * it.pr.s * 2.1;
          const g = ex.createRadialGradient(it.pr.x, it.pr.y, R * 0.7, it.pr.x, it.pr.y, R * 1.9);
          g.addColorStop(0, rgba(p.hue, 0.18)); g.addColorStop(1, rgba(p.hue, 0));
          ex.fillStyle = g; ex.beginPath(); ex.arc(it.pr.x, it.pr.y, R * 1.9, 0, TAU); ex.fill();
        } else {
          const r = Math.max(1.8, 5.5 * it.pr.s * 2.1);
          vx.fillStyle = mix(it.ag.color, "#ffffff", 0.3);
          vx.beginPath(); vx.arc(it.pr.x, it.pr.y, r, 0, TAU); vx.fill();
          const g = ex.createRadialGradient(it.pr.x, it.pr.y, 0, it.pr.x, it.pr.y, r * 3.4);
          g.addColorStop(0, rgba(it.ag.color, 0.85)); g.addColorStop(1, rgba(it.ag.color, 0));
          ex.fillStyle = g; ex.beginPath(); ex.arc(it.pr.x, it.pr.y, r * 3.4, 0, TAU); ex.fill();
        }
      });
      bloom(); post();
    };

    // ── frame loop ──
    const loop = (now: number) => {
      if (disposed) return;
      const s = useHub.getState();
      // DORMANT while a project stage covers the map (or the tab is hidden):
      // the galaxy stays mounted so the camera survives the trip, but a bloom
      // chain painting at 60fps under an opaque stage is pure heat — enough,
      // under a parallel e2e run, to starve the rest of the app into flaking.
      if (s.stage.kind !== "graph" || document.hidden) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const t = (now - t0) / 1000;
      tNow = t; frame++;
      const agents = s.agents;
      host.dataset.zoom = cam.z.toFixed(3);
      // The camera says for ITSELF whether zoom has arrived — tests that infer
      // "settled" from two equal rounded reads can be lied to by a value still
      // crossing a rounding boundary.
      host.dataset.zoomSettled = String(cam.z === cam.tz);
      host.dataset.mode = mode;
      if (mode === "3d") {
        if (driftOn && !hoverPause) cam3.tyaw += 0.0007;
        cam3.yaw += (cam3.tyaw - cam3.yaw) * 0.08;
        cam3.pitch += (cam3.tpitch - cam3.pitch) * 0.08;
        cam3.dist += (cam3.tdist - cam3.dist) * 0.07;
        (["x", "y", "z"] as const).forEach((ax) => { cam3.target[ax] += (cam3.ttarget[ax] - cam3.target[ax]) * 0.06; });
        draw3D(agents);
      } else {
        if (driftOn && !reduced && !hoverPause) {
          cam.tx = HOME.x + Math.cos(t * 0.04) * 170;
          cam.ty = HOME.y + Math.sin(t * 0.031) * 110;
        }
        // Eased, but SNAPPED once close: an asymptotic ease never lands, so
        // "the camera settled" would otherwise be false by a millistep forever
        // — visible as label micro-jitter and as a lock that reads as leaking.
        cam.x += (cam.tx - cam.x) * 0.028;
        cam.y += (cam.ty - cam.y) * 0.028;
        cam.z += (cam.tz - cam.z) * 0.05;
        if (Math.abs(cam.tx - cam.x) < 0.5) cam.x = cam.tx;
        if (Math.abs(cam.ty - cam.y) < 0.5) cam.y = cam.ty;
        if (Math.abs(cam.tz - cam.z) < 0.0005) cam.z = cam.tz;
        drawScene(t, agents);
        drawEmissive(t, agents);
        bloom(); post();
      }
      positionLabels(agents);
      raf = requestAnimationFrame(loop);
    };
    let raf = requestAnimationFrame(loop);

    // ── input ──
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;
    let downAt = 0, downPos = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      // Drag arms only on the sky itself. Labels and HUD buttons are children
      // of the host, and pointer CAPTURE here would retarget their click
      // events to the host — a map you can pan from anywhere but whose
      // buttons stop working is worse than one with a smaller drag surface.
      if ((e.target as HTMLElement).closest(".gal-lab, button")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      driftOn = false;
      downAt = performance.now(); downPos = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (lastPinch && !useHub.getState().mapLocked) {
          const k = dist / lastPinch;
          if (mode === "3d") cam3.tdist = Math.max(420, Math.min(5200, cam3.tdist / k));
          else cam.tz = Math.max(0.2, Math.min(3.1, cam.tz * k));
        }
        lastPinch = dist;
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (mode === "3d") {
        cam3.tyaw += dx * 0.005;
        cam3.tpitch = Math.max(0.06, Math.min(1.35, cam3.tpitch + dy * 0.004));
      } else {
        cam.tx -= dx / cam.z; cam.ty -= dy / cam.z;
        cam.x = cam.tx; cam.y = cam.ty;
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastPinch = 0;
      // A short, unmoved press in 3D is a planet pick (2.5D picks via labels).
      if (mode === "3d" && performance.now() - downAt < 240 &&
        Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 6) {
        let best: { id: string; d: number } | null = null;
        nodes.forEach((_n, id) => {
          const pr = project3(pos3(id));
          if (!pr) return;
          const d = Math.hypot(e.clientX - pr.x, e.clientY - pr.y);
          if (d < sprites.get(id)!.R * pr.s * 2.1 + 16 && (!best || d < best.d)) best = { id, d };
        });
        if (best) useHub.getState().openStage((best as { id: string }).id);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // The lock's contract, carried over: scroll-zoom is what it freezes.
      if (useHub.getState().mapLocked) return;
      driftOn = false;
      if (mode === "3d") cam3.tdist = Math.max(420, Math.min(5200, cam3.tdist * (e.deltaY > 0 ? 1.09 : 0.92)));
      else cam.tz = Math.max(0.2, Math.min(3.1, cam.tz * (e.deltaY > 0 ? 0.9 : 1.11)));
    };
    const onEnter = () => { hoverPause = true; };
    const onLeave = () => { hoverPause = false; };
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    host.addEventListener("wheel", onWheel, { passive: false });

    // ── HUD wiring (buttons live in JSX below; handlers attach by id) ──
    const $ = (sel: string) => host.querySelector<HTMLButtonElement>(sel)!;
    const hudZi = () => { if (mode === "3d") cam3.tdist = Math.max(420, cam3.tdist * 0.8); else cam.tz = Math.min(3.1, cam.tz * 1.25); cam.tz = cam.tz; };
    const zi = $("[data-hud=zi]"), zo = $("[data-hud=zo]"), fit = $("[data-hud=fit]"),
      drift = $("[data-hud=drift]"), m3d = $("[data-hud=m3d]");
    zi.onclick = () => { if (useHub.getState().mapLocked) return; if (mode === "3d") cam3.tdist = Math.max(420, cam3.tdist * 0.8); else cam.tz = Math.min(3.1, cam.tz * 1.25); };
    zo.onclick = () => { if (useHub.getState().mapLocked) return; if (mode === "3d") cam3.tdist = Math.min(5200, cam3.tdist * 1.25); else cam.tz = Math.max(0.2, cam.tz * 0.8); };
    fit.onclick = () => {
      if (mode === "3d") { cam3.tdist = 2600; cam3.ttarget = { x: 520, y: 0, z: 340 }; }
      else { cam.tx = HOME.x; cam.ty = HOME.y; cam.tz = HOME.z; }
    };
    drift.onclick = () => { driftOn = !driftOn; drift.style.color = driftOn ? "#5eead4" : "#8ea0bd"; };
    drift.style.color = driftOn ? "#5eead4" : "#8ea0bd";
    m3d.onclick = () => {
      mode = mode === "map" ? "3d" : "map";
      driftOn = !reduced;
      m3d.style.color = mode === "3d" ? "#5eead4" : "#8ea0bd";
      m3d.textContent = mode === "3d" ? "MAP" : "3D";
      labelHost.querySelectorAll<HTMLElement>(".gal-lab .m,.gal-lab .rule").forEach((el2) => {
        el2.style.display = mode === "3d" ? "none" : "";
      });
    };
    void hudZi;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("wheel", onWheel);
    };
    // Re-bake when the PROJECT LIST changes (a minted project gets its planet).
    // Store reads inside the loop are imperative on purpose.
  }, [projectCount]);

  const mapLocked = useHub((s) => s.mapLocked);
  const toggleMapLock = useHub((s) => s.toggleMapLock);

  return (
    <div ref={hostRef} data-testid="galaxy" className="relative h-full w-full overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="glass absolute right-4 bottom-4 z-20 flex gap-2 rounded-xl px-2.5 py-2">
        <button data-hud="zo" aria-label="Zoom out" className="gal-hbtn">−</button>
        <button data-hud="zi" aria-label="Zoom in" className="gal-hbtn">+</button>
        <button data-hud="fit" aria-label="Fit view" className="gal-hbtn">⤢</button>
        <button data-hud="drift" aria-label="Toggle idle drift" title="Idle orbital drift" className="gal-hbtn">◐</button>
        <button
          data-hud="m3d"
          aria-label="Toggle immersive 3D"
          title="Immersive 3D — free camera, real orbits"
          className="gal-hbtn"
          style={{ width: "auto", padding: "0 10px", fontSize: 10, letterSpacing: ".12em" }}
        >
          3D
        </button>
        <button
          aria-label={mapLocked ? "Unlock the view" : "Lock the view"}
          title="Lock scroll-zoom and pinch-zoom (pan stays live)"
          onClick={toggleMapLock}
          className="gal-hbtn"
          style={mapLocked ? { color: "#fbbf24", borderColor: "rgba(251,191,36,.5)" } : undefined}
        >
          {mapLocked ? "🔒" : "🔓"}
        </button>
      </div>
    </div>
  );
}
