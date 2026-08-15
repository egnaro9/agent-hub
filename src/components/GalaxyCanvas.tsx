import { useEffect, useRef, useState } from "react";
import { useHub } from "../state/hub";
import { useChrome } from "../state/chrome";
import { STRUCTURAL } from "../data/mock";
import { PAINTERS } from "./planets";
import { SUN, BLACK_HOLE, BINARY_R, WORMHOLES, binaryPose, sunGlow, sunCaption, perturb, wormholeTarget, type Wormhole } from "./constellation";
import { ARMS, CLUSTER_OF, FOUNDED, GALAXY_CENTER, SPIRAL, armAngleAt, clusterName, placeOnArms, rotatedAngle, spiralPos } from "./galaxySpiral";
import { FIT_MARGIN, FIT_Z, solveMapFit, type FitBody, type MapFit } from "./galaxyFit";
import { fetchRegistryCount, type RegistryCount } from "../data/registry";
import type { Agent, Project } from "../types";

/* ════════════════════════════════════════════════════════════════════════════
   THE GALAXY MAP — the hub's default spatial view (Phase 1 of the redesign).

   ONE spiral galaxy (the v2 layout): the five taxonomy clusters are
   log-spiral ARMS winding from a shared core, and the whole disc turns under
   differential rotation — inner arms outrunning the outer, subtly. Projects
   are planets with real surfaces (six seeded archetypes: gas, rock, ice,
   ember, ocean, city — plus one twin), lit by a consistent off-limb sun so
   every body carries a crescent, never an eyeball. Agents are moons orbiting
   the project their ASSIGNMENT names — the store is the single truth the map
   draws, which is exactly the contract the joinRoom fix bought. Structural
   relationships are breathing energy filaments. Everything emissive passes
   through a real additive bloom chain (offscreen → half-res → quarter-res
   blur → lighter), over fbm-baked nebulae, three parallax star layers, film
   grain and a vignette.

   The constellation layer (constellation.ts) adds the bodies that are NOT
   planets — the CORE IS A BINARY: the SUN — the evidence registry, corona
   data-bound to the live accepted-claim count, the one click that leaves for
   the registry page — and the BLACK HOLE — the harness, rendered only by
   lensing, accretion and the perturbed orbits nearby, with no way in — orbit
   their common barycenter at the galactic center, slowly; the hole's
   influence rides its live position. WORMHOLES — ring-and-aperture portals
   to destinations best experienced where they run — park at the arm tips,
   the doors out at the rim.

   Two projections share the sprites and the bloom: the default 2.5D map, and
   an optional immersive 3D mode (free-orbit camera, the same disc flat in
   space) behind the HUD's 3D button. The mock this ports from lives in the
   design history; the production 3D mode is earmarked for R3F if it outgrows
   this hand-rolled projection.

   Perf discipline, paid for in the mock: EVERYTHING expensive is baked once —
   nebulae (low-res fbm, upscaled), star tiles, planet sprites, grain — and
   the per-frame path never touches ctx.filter (software-path trap).
   ═══════════════════════════════════════════════════════════════════════════ */

const TAU = Math.PI * 2;
// Below this canvas width there is no room to stage a planet beside its card,
// so the arrival stays centred and the card floats over the world.
const SIDE_MIN_W = 700;
const LIGHT = { x: -0.62, y: -0.72 };
const HOME: MapFit = { x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, z: 0.4 };

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

// ── archetype assignments (arm membership lives in galaxySpiral.ts) ────────
type Kind = "gas" | "rock" | "ice" | "ember" | "ocean" | "city" | "twin";
const KIND_OF: Record<string, Kind> = {
  gradecore: "gas", crashkit: "ember", "model-drift": "gas", "rag-eval-lab": "ocean",
  "eval-history": "rock", "eval-dashboard": "ice", "prompt-regress": "rock", "pi-eval": "ice",
  "agentic-dev-harness": "city", "pi-gates": "rock", "harness-builder": "gas",
  "agent-graph": "city", "mcp-tools": "ice", "llm-gateway": "gas",
  "match3-engine": "rock", "tapdodge-engine": "gas", "evals-differential-oracle": "twin",
  "cast-pipeline": "ocean",
  "vac-protocol": "rock", "agent-certlab": "city", "reference-fleet": "rock",
  evalmut: "ember", "vac-gate": "rock",
};
// Planet size is RATIONAL, not curated: mass = how much of the system runs
// through this world. Each structural link adds heft, resident crew adds a
// little more — so the most-connected project on an arm is also its biggest
// body AND sits nearest the core, and the sizes stay true as the portfolio
// grows.
const degreeOf = (id: string) =>
  STRUCTURAL.filter((e) => e.source === id || e.target === id).length;
const radiusOf = (id: string, crewCount: number) =>
  Math.min(42, 16 + degreeOf(id) * 5 + crewCount * 3);
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

function bakePlanet(id: string, hue: string, kind: Kind, radius: number, phase = 0): Sprite {
  seed = idSeed(id);
  const R = radius * 2.2, PAD = Math.ceil(R * 0.55), S = Math.ceil((R + PAD) * 2);
  // Sprites bake at 2× and draw downscaled: the arrival zoom (2.2) otherwise
  // upscales the bake and softens exactly the detail the painters put in.
  const SS = 2;
  const c = document.createElement("canvas"); c.width = c.height = S * SS;
  const e = document.createElement("canvas"); e.width = e.height = S * SS;
  const g = c.getContext("2d")!, ge = e.getContext("2d")!;
  g.scale(SS, SS); ge.scale(SS, SS);
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
  // The emissive map tilts WITH the surface, so a painter's glowing feature
  // lands exactly where its diffuse twin does.
  ge.save(); ge.beginPath(); ge.arc(cx0, cy0, R, 0, TAU); ge.clip();
  ge.translate(cx0, cy0); ge.rotate(tilt); ge.translate(-cx0, -cy0);

  const bespoke = PAINTERS[id];
  if (bespoke) {
    // Individual worlds — each surface derived from what the project IS
    // (see planets.ts). The archetype switch below only serves projects
    // minted at runtime, which have no story yet.
    bespoke({ g, ge, cx: cx0, cy: cy0, R, hue, rnd, fbm, rgba, mix, LIGHT, TAU, phase });
  } else if (kind === "gas") {
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
  ge.restore();
  g.restore();

  // RELIGHT — re-impose the crescent AFTER the painter. Surface programs
  // legitimately cover the base gradient; without this pass the lit side
  // decays into one greasy off-center highlight while the paint sits flat.
  const rl = g.createRadialGradient(
    cx0 + LIGHT.x * R * 0.85, cy0 + LIGHT.y * R * 0.85, R * 0.05,
    cx0 + LIGHT.x * R * 0.15, cy0 + LIGHT.y * R * 0.15, R * 1.9
  );
  rl.addColorStop(0, "rgba(255,251,240,.5)");
  rl.addColorStop(0.4, "rgba(255,250,240,.16)");
  rl.addColorStop(0.75, "rgba(255,255,255,0)");
  g.save(); g.beginPath(); g.arc(cx0, cy0, R, 0, TAU); g.clip();
  g.globalCompositeOperation = "soft-light";
  g.fillStyle = rl; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = "screen";
  g.globalAlpha = 0.45;
  g.fillRect(0, 0, S, S);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
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
// The five taxonomy clusters are log-spiral ARMS from the shared core (the
// binary's barycenter); a project's seat is its slot down its arm — the
// most-connected world nearest the core. The math is galaxySpiral.ts, pure
// and unit-pinned; x/y here are the FROZEN (t = 0) pose, and the frame loop
// re-derives live positions from (rG, aG) under differential rotation.
interface GNode {
  x: number; y: number; z: number;
  armId: string;
  cluster: { id: string; name: string };
  rG: number; aG: number; y3: number;
}
function layout(projects: Project[]) {
  const placed = placeOnArms(projects.map((p) => ({ id: p.id, degree: degreeOf(p.id) })));
  const nodes = new Map<string, GNode>();
  const zs = [1.06, 1, 0.92, 1.02, 0.88, 0.82, 0.9, 0.78, 0.86];
  projects.forEach((p) => {
    const pl = placed.get(p.id)!;
    seed = idSeed(p.id) + 7;
    const y3 = (rnd() - 0.5) * 120;
    nodes.set(p.id, {
      x: pl.x, y: pl.y, z: zs[pl.slot % zs.length],
      armId: pl.armId,
      cluster: { id: pl.clusterId, name: clusterName(pl.clusterId) },
      rG: pl.r, aG: pl.a, y3,
    });
  });
  return nodes;
}

// ── the component ───────────────────────────────────────────────────────────
export default function GalaxyCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // The fly-in arrival card. `flying` dims/blurs the sky the moment a planet
  // is clicked; `arrival` lands the card once the camera is most of the way
  // there. State lives OUT here (the frame loop is inside an effect keyed by
  // project count — a re-render must not re-bake the sky), and the effect
  // exposes its camera through refs so the card can hand it back.
  const [flying, setFlying] = useState<string | null>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const flyRef = useRef<(id: string) => void>(() => {});
  const returnRef = useRef<() => void>(() => {});
  // One gesture, three meanings: a fresh id flies there (swapping any card
  // already up), the SAME id again lowers the card back into the galaxy.
  const currentRef = useRef<string | null>(null);
  currentRef.current = arrival ?? flying;
  const toggleRef = useRef<(id: string) => void>(() => {});
  // The scrim covers the sky while a card is up, so React needs the canvas's
  // own hit test to tell a neighbouring WORLD from empty space.
  const hitRef = useRef<(x: number, y: number) => string | null>(() => null);
  toggleRef.current = (id: string) => {
    if (currentRef.current === id) returnRef.current();
    else flyRef.current(id);
  };

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
    // Positions re-derive from the polar base (rG, aG) every frame:
    // differential rotation sweeps the disc, the unseen mass bends what
    // passes near its live position, and neither can accumulate drift into
    // the layout. tw = 0 is the frozen pose — the mount paint and
    // prefers-reduced-motion both draw exactly this state, binary included.
    const advanceWorld = (tw: number) => {
      nodes.forEach((n) => {
        const p0 = spiralPos(n.rG, n.aG, tw);
        const q = perturb(p0.x, p0.y, tw);
        n.x = p0.x + q.dx; n.y = p0.y + q.dy;
      });
      // The doors are tidally locked: same differential rotation as the
      // worlds, each at its own rim radius, so a bearing chosen into a
      // tip-to-tip void STAYS in that void. Unperturbed — a portal that
      // wobbled to the harness's mass would read as loose, not locked.
      WORMHOLES.forEach((w) => {
        const p = spiralPos(w.rG, w.aG, tw);
        w.x = p.x; w.y = p.y;
      });
    };
    // The registry read lands asynchronously; until it does the sun burns at
    // its dim default and the label says it is still reading.
    let reg: RegistryCount | null = null;
    const sprites = new Map<string, Sprite>();
    const assignmentsNow = useHub.getState().assignments;
    projects.forEach((p) => {
      const kind = KIND_OF[p.id] ?? FALLBACK_KINDS[idSeed(p.id) % FALLBACK_KINDS.length];
      const crewCount = Object.values(assignmentsNow).filter((pid) => pid === p.id).length;
      sprites.set(p.id, bakePlanet(p.id, p.hue, kind, radiusOf(p.id, crewCount)));
    });
    seed = 1379;
    const NEB = [
      { c: bakeNebula("#1d4ed8", { stretch: 2.2, gain: 0.9 }), x: -350, y: -140, s: 2500, p: 0.34, a: 0.42, dark: false },
      { c: bakeNebula("#0891b2", { stretch: 1.4, gain: 1.05 }), x: -40, y: 60, s: 1750, p: 0.5, a: 0.5, dark: false },
      { c: bakeNebula("#7c3aed", { stretch: 1.8, gain: 0.95 }), x: 1180, y: -420, s: 1600, p: 0.5, a: 0.44, dark: false },
      { c: bakeNebula("#2563eb", { stretch: 1.5, gain: 0.9 }), x: 1020, y: 680, s: 1450, p: 0.5, a: 0.38, dark: false },
      { c: bakeNebula("#be185d", { stretch: 1.3, gain: 0.8 }), x: -40, y: 1050, s: 1150, p: 0.5, a: 0.3, dark: false },
      // the gold one keeps riding the registry's light — that is the core now
      { c: bakeNebula("#a16207", { stretch: 1.6, gain: 0.9 }), x: 900, y: 160, s: 1550, p: 0.5, a: 0.36, dark: false },
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
    // Tinted glow sprites for the per-world vital signs, baked on first use.
    const glowCache = new Map<string, HTMLCanvasElement>();
    const glowFor = (col: string) => {
      let c = glowCache.get(col);
      if (c) return c;
      c = document.createElement("canvas");
      c.width = c.height = 96;
      const g2 = c.getContext("2d")!;
      const grad = g2.createRadialGradient(48, 48, 0, 48, 48, 48);
      grad.addColorStop(0, rgba(mix(col, "#ffffff", 0.55), 1));
      grad.addColorStop(0.45, rgba(col, 0.35));
      grad.addColorStop(1, rgba(col, 0));
      g2.fillStyle = grad;
      g2.beginPath(); g2.arc(48, 48, 48, 0, TAU); g2.fill();
      glowCache.set(col, c);
      return c;
    };
    const em = document.createElement("canvas"), ex = em.getContext("2d")!;
    const bl1 = document.createElement("canvas"), b1 = bl1.getContext("2d")!;
    const bl2 = document.createElement("canvas"), b2 = bl2.getContext("2d")!;

    // ── view state ──
    let W = 0, H = 0;
    let DPR = Math.min(devicePixelRatio || 1, 2);
    const sizeAll = () => {
      // Re-read per call: browser page zoom changes devicePixelRatio LIVE,
      // and a backing store sized with the mount-time value renders every
      // later frame soft (or oversampled) after a Cmd+−/+ — observed as a
      // clean-2× backing store on a canvas the browser had since rescaled.
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = host.clientWidth; H = host.clientHeight;
      view.width = W * DPR; view.height = H * DPR;
      vx.setTransform(DPR, 0, 0, DPR, 0, 0);
      em.width = W || 1; em.height = H || 1;   // a 0-sized host must not detonate bloom()
      bl1.width = W >> 1 || 1; bl1.height = H >> 1 || 1;
      bl2.width = W >> 2 || 1; bl2.height = H >> 2 || 1;
      host.dataset.arrive = W >= SIDE_MIN_W ? "side" : "center";
    };
    sizeAll();
    // Re-framing on resize is declared after the fit solvers exist; this
    // observer only sizes the buffers until then.
    let onResize: () => void = sizeAll;
    const ro = new ResizeObserver(() => onResize());
    ro.observe(host);

    const cam = { x: HOME.x, y: HOME.y, z: HOME.z, tx: HOME.x, ty: HOME.y, tz: HOME.z };
    // 3D scale: the 2.5D layout is composed for a flat viewport; in
    // perspective the same coordinates bunch. SPREAD3 pushes clusters and
    // rings apart, and the dolly range opens far enough to take in the whole
    // system from outside.
    const SPREAD3 = 2.6;
    const CENTER3 = { x: 520 * SPREAD3, y: 0, z: 340 * SPREAD3 };
    const DIST3 = { home: 5200, min: 420, max: 16000 };
    const cam3 = { yaw: 0.6, pitch: 0.62, dist: DIST3.home, tyaw: 0.6, tpitch: 0.62, tdist: DIST3.home,
      target: { ...CENTER3 }, ttarget: { ...CENTER3 } };
    const F3 = 980, NEAR = 80;
    let mode: "map" | "3d" = "map";

    // ── fit: MEASURED, not assumed ────────────────────────────────────────
    // A fixed home zoom fits one viewport. These solve for the camera that
    // frames every planet in the CURRENT canvas, so the same button gives a
    // whole system on a laptop half-window and on a 5K display.
    const MARGIN = FIT_MARGIN; // labels hang below; HUD owns the bottom-right
    // The constellation bodies are part of what the fit frames — a sun the
    // home view crops is a registry nobody sees. The binary orbits, so its
    // extents reserve the WHOLE orbit about the barycenter; the doors are
    // fixed at the rim. Everything celestial rides parallax 1.
    const CEL_EXTENT = [
      {
        x: GALAXY_CENTER.x, y: GALAXY_CENTER.y,
        rx: BINARY_R.sun + SUN.r * 2.2, ry: BINARY_R.sun * SPIRAL.squashY + SUN.r * 2.2,
      },
      {
        x: GALAXY_CENTER.x, y: GALAXY_CENTER.y,
        rx: BINARY_R.hole + BLACK_HOLE.r * 2.3, ry: BINARY_R.hole * SPIRAL.squashY + BLACK_HOLE.r * 2.3,
      },
      // A rotating door sweeps its whole orbit, so the home fit reserves the
      // ORBIT ellipse, not tonight's position — the frame never has to chase.
      ...WORMHOLES.map((w) => ({
        x: GALAXY_CENTER.x, y: GALAXY_CENTER.y,
        rx: w.rG + w.r * 1.7 + 95, ry: w.rG * SPIRAL.squashY + w.r * 1.2 + 22,
      })),
    ];

    /** 2.5D: planets ride a parallax factor, so the fit is solved iteratively
        — each recentring changes every node's effective offset. Radii scale
        with zoom exactly like positions, which is what lets one z fall out.
        Each planet reserves the whole CIRCLE it sweeps about the center, not
        its momentary pose: the fit is rotation-invariant, so differential
        rotation can never carry a world out of the home frame — and ⤢ lands
        the same camera at any hour, which is what keeps the fit assertions
        deterministic. The solve itself lives in galaxyFit.ts, pure and
        unit-pinned; this wrapper only gathers what is out there. */
    const fitMap = () => {
      const bodies: FitBody[] = [];
      nodes.forEach((n, id) => {
        const sp = sprites.get(id)!;
        // a ring is WIDE and FLAT (ringPath: rx 2.1R, ry 0.62R) — reserving
        // its width vertically shrank the whole frame for two planets
        const ring = RINGED.has(id);
        bodies.push({
          x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, p: 0.88 + n.z * 0.12,
          rx: n.rG + sp.R * n.z * (ring ? 2.25 : 1.2),
          ry: n.rG * SPIRAL.squashY + sp.R * n.z * 1.2,
          centroid: true,
        });
      });
      CEL_EXTENT.forEach((b) => bodies.push({ x: b.x, y: b.y, rx: b.rx, ry: b.ry, p: 1, centroid: false }));
      return solveMapFit(bodies, W, H, HOME);
    };

    /** The system's TRUE 3D centre — the midpoint of what is actually out
        there, measured from the bodies. CENTER3 was hand-set for an earlier
        layout, and every change to clusters, spread or sizing silently moved
        the real centre away from it. */
    const center3 = () => {
      if (nodes.size === 0) return { ...CENTER3 };
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      nodes.forEach((_n, id) => {
        const q = pos3(id);
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
        z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
      });
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    };

    /** 3D: solve the aim AND the dolly together. Perspective is why this can't
        be one shot — under it the geometric centre of the bodies is NOT the
        centre of their projection (near bodies throw further from centre than
        far ones), which parked the whole system low on tall screens. So:
        distance from the current aim, then measure the PROJECTED box and slide
        the aim along the camera's own right/up axes to centre it. Converges in
        a couple of passes. */
    const fit3 = () => {
      const fallback = { target: center3(), dist: DIST3.home };
      if (nodes.size === 0 || W === 0) return fallback;
      const c = cam3;
      const cyw = Math.cos(c.tyaw), syw = Math.sin(c.tyaw);
      const cp = Math.cos(c.tpitch), sp2 = Math.sin(c.tpitch);
      // camera-space basis in WORLD terms: x1 = d·right, y2 = d·down
      const right = { x: cyw, y: 0, z: -syw };
      const down = { x: -syw * sp2, y: cp, z: -cyw * sp2 };
      const halfW = Math.max(80, W / 2 - MARGIN.x), halfH = Math.max(80, H / 2 - MARGIN.top);
      const target = center3();
      let dist = DIST3.home;
      for (let pass = 0; pass < 4; pass++) {
        // 1. the dolly this aim needs
        let need = DIST3.min;
        const cam: { x1: number; y2: number; z2: number; r: number }[] = [];
        nodes.forEach((_n, id) => {
          const q = pos3(id), sp = sprites.get(id)!;
          const dx = q.x - target.x, dy = q.y - target.y, dz = q.z - target.z;
          const x1 = dx * cyw - dz * syw, z1 = dx * syw + dz * cyw;
          const y2 = dy * cp - z1 * sp2, z2 = dy * sp2 + z1 * cp;
          const r = sp.R * 2.1;
          cam.push({ x1, y2, z2, r });
          need = Math.max(need, (Math.abs(x1) + r) * F3 / halfW - z2, (Math.abs(y2) + r) * F3 / halfH - z2);
        });
        dist = Math.max(DIST3.min, Math.min(DIST3.max, need));
        // 2. where that actually PUTS everything, in pixels
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, sSum = 0;
        for (const b of cam) {
          const zc = b.z2 + dist;
          if (zc < NEAR) continue;
          const s = F3 / zc;
          sSum += s;
          xMin = Math.min(xMin, b.x1 * s - b.r * s); xMax = Math.max(xMax, b.x1 * s + b.r * s);
          yMin = Math.min(yMin, b.y2 * s - b.r * s); yMax = Math.max(yMax, b.y2 * s + b.r * s);
        }
        if (!isFinite(xMin) || sSum === 0) return fallback;
        const sMean = sSum / cam.length;
        const offX = (xMin + xMax) / 2, offY = (yMin + yMax) / 2; // px from centre
        if (Math.abs(offX) < 1.5 && Math.abs(offY) < 1.5) break;
        // 3. slide the aim so that offset goes to zero
        const wx = offX / sMean, wy = offY / sMean;
        target.x += right.x * wx + down.x * wy;
        target.y += right.y * wx + down.y * wy;
        target.z += right.z * wx + down.z * wy;
      }
      return { target, dist };
    };

    // THE SPIN. A world turns while it is BIG — and a stage full of frozen
    // neighbours around one turning planet reads worse than nothing turning at
    // all, which is exactly what a single-hero spin looked like. So every
    // planet large enough to resolve turns, and the cost stays flat: one
    // re-bake per tick, ROUND-ROBIN across the spinning set, so adding
    // neighbours costs frame RATE per planet rather than frame TIME.
    //
    // At map size none of this runs: planets are 20-40px there, where a
    // rotating surface is invisible and re-baking eighteen sprites would buy
    // detail nobody can resolve.
    const SPIN_MIN_R = 26;     // screen radius below which rotation is invisible
    const SPIN_EVERY = 3;      // frames between re-bakes
    const SPIN_SPEED = 0.0018; // radians per frame: a turn in ~58s
    const spinning = new Map<string, Sprite>();
    const phases = new Map<string, number>();
    let spinTick = 0;
    let spinCursor = 0;
    const clearSpin = () => {
      if (spinning.size) { spinning.clear(); phases.clear(); }
    };
    /** Which worlds are currently worth turning: on screen, and big enough. */
    const spinnable = (): string[] => {
      const out: string[] = [];
      nodes.forEach((n, id) => {
        const sp = sprites.get(id)!;
        if (mode === "3d") {
          const pr = project3(pos3(id));
          if (pr && sp.R * pr.s * 2.1 >= SPIN_MIN_R) out.push(id);
          return;
        }
        const r = sp.R * cam.z * n.z;
        if (r < SPIN_MIN_R) return;
        const [sx, sy] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        if (sx > -r * 2 && sx < W + r * 2 && sy > -r * 2 && sy < H + r * 2) out.push(id);
      });
      return out;
    };
    const spinFrame = (staged: string | null) => {
      if (!staged) { clearSpin(); return; }
      if (spinTick++ % SPIN_EVERY) return;
      const set = spinnable();
      if (set.length === 0) { clearSpin(); return; }
      // Drop worlds that left the set, so a sprite can't be stuck mid-turn
      // after the camera moves away from it.
      for (const id of [...spinning.keys()]) if (!set.includes(id)) { spinning.delete(id); phases.delete(id); }
      const id = set[spinCursor++ % set.length];
      const n = nodes.get(id);
      const p2 = useHub.getState().projects.find((pp) => pp.id === id);
      if (!n || !p2) return;
      // Each world keeps its own phase and its own rate — a stage rotating in
      // lockstep reads as one mechanism, not as separate bodies.
      const rate = SPIN_SPEED * (0.75 + ((idSeed(id) % 100) / 100) * 0.5);
      phases.set(id, (phases.get(id) ?? ((idSeed(id) % 628) / 100)) + rate * SPIN_EVERY * set.length);
      const kind = KIND_OF[id] ?? FALLBACK_KINDS[idSeed(id) % FALLBACK_KINDS.length];
      const crew = Object.values(useHub.getState().assignments).filter((pid) => pid === id).length;
      spinning.set(id, bakePlanet(id, p2.hue, kind, radiusOf(id, crew), phases.get(id)!));
    };
    /** The sprite to draw: the turning one where a world is turning. */
    const spriteFor = (id: string) => spinning.get(id) ?? sprites.get(id)!;

    // The fitted frame is also the DRIFT's home — the idle cruise has to orbit
    // where the system actually is, not a constant from a past viewport.
    let home = fitMap();
    cam.x = cam.tx = home.x; cam.y = cam.ty = home.y; cam.z = cam.tz = home.z;
    // The 3D fit reads pos3, which is declared below — it is solved when 3D is
    // first entered (and on ⤢ / resize), never eagerly from here.
    // Cleared the moment the operator takes the camera; a resize only re-frames
    // a view the operator hasn't personally aimed.
    let atHome = true;
    let driftOn = !reduced;
    // The operator's ◐ choice, which fly-in/return must RESTORE, not reset —
    // "I turned the drift off" has to survive a trip to a planet and back.
    let driftPref = !reduced;
    let hoverPause = false;
    // Screensaver re-arm: any interaction kills the drift, but 30s of stillness
    // brings it back (if ◐ is on) — and idle also overrides hoverPause, or a
    // cursor parked over the sky would block the resume forever.
    // When the galaxy last painted. A stage covering it parks the loop, so a
    // gap here means the map has NOT been on screen.
    let lastDrawAt = performance.now();
    const IDLE_MS = 30_000;
    let lastInput = performance.now();
    const noteInput = () => { lastInput = performance.now(); };
    let disposed = false;
    const t0 = performance.now();
    let frame = 0, tNow = 0;

    const w2s = (x: number, y: number, p = 1): [number, number] =>
      [(x - cam.x * p) * cam.z + W / 2, (y - cam.y * p) * cam.z + H / 2];

    /** 3D seats ride the same differential rotation as the flat map — the
        disc is FLAT in 3D (no squash; that was the 2.5D inclination), with
        each world's y3 jitter for depth. Reduced motion pins t = 0. */
    const pos3 = (id: string) => {
      const n = nodes.get(id)!;
      const a = rotatedAngle(n.rG, n.aG, reduced ? 0 : tNow);
      return {
        x: (GALAXY_CENTER.x + Math.cos(a) * n.rG) * SPREAD3,
        y: n.y3,
        z: (GALAXY_CENTER.y + Math.sin(a) * n.rG) * SPREAD3,
      };
    };
    /** Celestial bodies sit on the galactic plane in 3D. */
    const cel3 = (b: { x: number; y: number }) => ({ x: b.x * SPREAD3, y: 0, z: b.y * SPREAD3 });
    /** The binary's live pose — frozen at its t = 0 seat under reduced
        motion, exactly the pose the mount paint draws (tNow starts at 0). */
    const poseNow = () => binaryPose(reduced ? 0 : tNow);
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
          toggleRef.current(p.id);
        }
      });
      d.innerHTML =
        `<div class="n">${p.name}</div><div class="rule"></div>` +
        `<div class="m">${n.cluster.name}${links ? ` · ${links} link${links > 1 ? "s" : ""}` : ""}<span class="crew"></span></div>` +
        `<div class="tag">${p.tagline}</div>`;
      d.addEventListener("click", () => toggleRef.current(p.id));
      labelHost.appendChild(d);
      labelEls.set(p.id, d);
    });

    // ── celestial labels: the registry, the portals, the void ──────────────
    // Their own class, never .gal-lab — that class is an e2e contract ("one
    // label per project"), and none of these is a project. Sun and wormholes
    // are REAL anchors: keyboard reachable natively, and the estate rule
    // (same tab inside egnaro9.github.io, new tab external) is just href +
    // target. The void gets no nameplate — a hover/focus reveal seated on
    // the body, saying only what an observer could measure.
    const celEls = new Map<string, HTMLElement>();
    const portalAnchor = (id: string, cls: string, url: string, aria: string, html: string) => {
      const a = document.createElement("a");
      a.className = `gal-cel ${cls}`;
      a.dataset.cel = id;
      a.href = url;
      if (wormholeTarget(url).newTab) { a.target = "_blank"; a.rel = "noopener"; }
      a.setAttribute("aria-label", aria);
      a.innerHTML = html;
      labelHost.appendChild(a);
      celEls.set(id, a);
      return a;
    };
    const sunLab = portalAnchor(
      "sun", "gal-cel--sun", SUN.url,
      `${SUN.name} — the live registry page`,
      `<div class="n">${SUN.name}</div><div class="rule"></div><div class="m">${sunCaption(null)}</div>`
    );
    WORMHOLES.forEach((w) => {
      const el = portalAnchor(
        w.id, "gal-cel--wh", w.url,
        `${w.name} — portal: ${w.claim}`,
        `<div class="n">${w.name}</div><div class="rule"></div><div class="m">${w.claim} · opens live</div>`
      );
      el.style.setProperty("--wh", w.hue);
    });
    const holeLab = document.createElement("div");
    holeLab.className = "gal-cel gal-cel--hole";
    holeLab.dataset.cel = "hole";
    holeLab.tabIndex = 0;
    holeLab.setAttribute("aria-label", "the harness — unseen mass, read from the motion of everything else");
    holeLab.innerHTML = `<div class="m">the harness — unseen mass, read from the motion of everything else</div>`;
    labelHost.appendChild(holeLab);
    celEls.set("hole", holeLab);

    // The sun's brightness is a verifiable claim: bind it to the registry the
    // moment the count lands. On failure the caption stays honest — last seen
    // or nothing — and the corona keeps its dim default.
    fetchRegistryCount().then((r) => {
      if (disposed) return;
      reg = r;
      const m = sunLab.querySelector<HTMLElement>(".m");
      if (m) m.textContent = sunCaption(r);
      sunLab.setAttribute("aria-label", `${SUN.name} — ${sunCaption(r)}`);
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
        // Orbit path split like the ring paths — far half under the planet,
        // near half over it. A full ellipse drawn in either single pass would
        // cross the disc or vanish behind it.
        vx.strokeStyle = rgba(ag.color, 0.15); vx.lineWidth = 0.8;
        vx.beginPath();
        if (layer === "back") vx.ellipse(m.hx, m.hy, m.orb * 1.3, m.orb * 0.5, 0, Math.PI, TAU);
        else vx.ellipse(m.hx, m.hy, m.orb * 1.3, m.orb * 0.5, 0, 0, Math.PI);
        vx.stroke();
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

    // ── the constellation painters ─────────────────────────────────────────
    // All four draw at SCREEN scale on the shared contexts, so the flat map
    // and the 3D projection use the same art with different (sx, sy, R).
    const off = (sx: number, sy: number, R: number) =>
      sx < -R * 3 || sx > W + R * 3 || sy < -R * 3 || sy > H + R * 3;

    /** The sun's diffuse photosphere. Corona and its data-bound brightness
        live on the emissive layer (emitSun) so they pass through bloom. */
    const paintSun = (sx: number, sy: number, R: number, t: number) => {
      if (off(sx, sy, R)) return;
      const { glow } = sunGlow(reg?.accepted ?? null);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.55) * 0.02;
      const r0 = R * breathe;
      const core = vx.createRadialGradient(sx, sy, 0, sx, sy, r0);
      core.addColorStop(0, "rgba(255,252,242,.98)");
      core.addColorStop(0.62, `rgba(255,236,186,${0.55 + glow * 0.4})`);
      core.addColorStop(1, "rgba(255,214,140,0)");
      vx.fillStyle = core;
      vx.beginPath(); vx.arc(sx, sy, r0, 0, TAU); vx.fill();
    };
    const emitSun = (sx: number, sy: number, R: number, t: number) => {
      const { glow, corona } = sunGlow(reg?.accepted ?? null);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.55) * 0.02;
      const cr = R * corona * breathe;
      if (off(sx, sy, cr)) return;
      const g = ex.createRadialGradient(sx, sy, R * 0.3, sx, sy, cr);
      g.addColorStop(0, `rgba(255,240,205,${0.12 + 0.5 * glow})`);
      g.addColorStop(0.4, `rgba(255,220,150,${0.22 * glow})`);
      g.addColorStop(1, "rgba(255,210,140,0)");
      ex.fillStyle = g;
      ex.beginPath(); ex.arc(sx, sy, cr, 0, TAU); ex.fill();
    };

    /** The unseen mass. No surface is ever painted — the sky's own light
        dies toward the horizon, the background lenses into thin arcs, and an
        accretion streak glows. Everything else it "shows" is the perturbed
        motion of its neighbours. */
    const paintHole = (sx: number, sy: number, R: number, t: number) => {
      if (off(sx, sy, R * 2.6)) return;
      const v = vx.createRadialGradient(sx, sy, 0, sx, sy, R * 2.6);
      v.addColorStop(0, "rgba(1,2,6,.97)");
      v.addColorStop(0.42, "rgba(1,2,6,.88)");
      v.addColorStop(1, "rgba(1,2,6,0)");
      vx.fillStyle = v;
      vx.beginPath(); vx.arc(sx, sy, R * 2.6, 0, TAU); vx.fill();
      const spin = reduced ? 0 : t * 0.07;
      vx.save(); vx.translate(sx, sy); vx.rotate(-0.35);
      // Faint lensed background arcs — the sky itself bending past the mass.
      for (let k = 0; k < 3; k++) {
        const rr = R * (1.32 + k * 0.3);
        vx.strokeStyle = `rgba(200,215,240,${0.11 - k * 0.03})`;
        vx.lineWidth = 0.8;
        vx.beginPath(); vx.ellipse(0, 0, rr, rr * 0.42, 0, spin + k, spin + k + 2.1); vx.stroke();
      }
      // The equatorial accretion disk, doppler-graded: the approaching (left)
      // limb burns white-hot, the receding limb cools to a deep ember — the
      // M87*-image asymmetry. Two passes: a wide warm band and a hot inner
      // edge hugging the shadow.
      const acc = vx.createLinearGradient(-R * 2.1, 0, R * 2.1, 0);
      acc.addColorStop(0, "rgba(255,232,200,0)");
      acc.addColorStop(0.22, "rgba(255,225,185,.5)");
      acc.addColorStop(0.5, "rgba(255,200,140,.2)");
      acc.addColorStop(0.8, "rgba(200,120,80,.16)");
      acc.addColorStop(1, "rgba(160,90,70,0)");
      vx.strokeStyle = acc; vx.lineWidth = Math.max(1.4, R * 0.22);
      vx.beginPath(); vx.ellipse(0, 0, R * 1.6, R * 0.5, 0, 0, TAU); vx.stroke();
      vx.strokeStyle = acc; vx.lineWidth = Math.max(1, R * 0.1);
      vx.beginPath(); vx.ellipse(0, 0, R * 1.22, R * 0.38, 0, 0, TAU); vx.stroke();
      // The LENSED far side of that same disk: light from behind the hole is
      // bent over the top and under the bottom, so the disk also appears as a
      // near-circular halo hugging the shadow — Luminet's 1979 drawing,
      // Gargantua's crossing. Top arc (over) carries more of the light.
      const halo = vx.createLinearGradient(-R * 1.5, 0, R * 1.5, 0);
      halo.addColorStop(0, "rgba(255,228,190,.42)");
      halo.addColorStop(0.55, "rgba(255,205,150,.2)");
      halo.addColorStop(1, "rgba(200,120,80,.1)");
      vx.strokeStyle = halo; vx.lineWidth = Math.max(1.2, R * 0.13);
      vx.beginPath(); vx.ellipse(0, 0, R * 1.18, R * 1.28, 0, Math.PI * 1.02, Math.PI * 1.98); vx.stroke();
      vx.lineWidth = Math.max(0.9, R * 0.09);
      vx.beginPath(); vx.ellipse(0, 0, R * 1.18, R * 1.24, 0, Math.PI * 0.06, Math.PI * 0.94); vx.stroke();
      vx.restore();
    };
    const emitHole = (sx: number, sy: number, R: number, _t: number) => {
      if (off(sx, sy, R * 1.9)) return;
      // the photon ring — the one bright thing, and it is bent LIGHT, not
      // surface; the approaching side beams brighter, doppler-fashion
      ex.save(); ex.translate(sx, sy); ex.rotate(-0.35);
      ex.strokeStyle = "rgba(255,214,168,.55)"; ex.lineWidth = Math.max(0.9, R * 0.08);
      ex.beginPath(); ex.ellipse(0, 0, R * 1.06, R * 1.02, 0, 0, TAU); ex.stroke();
      ex.strokeStyle = "rgba(255,240,210,.95)"; ex.lineWidth = Math.max(1.2, R * 0.12);
      ex.beginPath(); ex.ellipse(0, 0, R * 1.06, R * 1.02, 0, Math.PI * 0.75, Math.PI * 1.35); ex.stroke();
      // the doppler hot spot — the approaching limb of the disk, bloomed: the
      // one place the M87* image is genuinely bright
      const hs = ex.createRadialGradient(-R * 1.35, R * 0.12, 0, -R * 1.35, R * 0.12, R * 0.9);
      hs.addColorStop(0, "rgba(255,235,205,.5)");
      hs.addColorStop(1, "rgba(255,220,170,0)");
      ex.fillStyle = hs;
      ex.beginPath(); ex.arc(-R * 1.35, R * 0.12, R * 0.9, 0, TAU); ex.fill();
      ex.restore();
    };

    /** A portal is ring-and-aperture, never a disc: a dark throat punched in
        the sky, a doubled rim in the destination's hue. Planet rings are wide
        and FLAT — an aperture stays steep so the two never read alike. */
    const paintWormhole = (w: Wormhole, sx: number, sy: number, R: number, t: number) => {
      if (off(sx, sy, R * 2.2)) return;
      /* SPHERICAL, by operator decree (2026-08-15): each door is a small
         black hole BODY — a round shadow wrapped in a colour-appropriate
         CORONA — not the old flat ring-aperture. It stays unmistakable
         beside a planet because it is dark where planets are lit: the only
         bright parts are bent light in the destination's hue. */
      vx.save(); vx.translate(sx, sy);
      // the corona — soft hue glow breathing around the body
      const breathe = reduced ? 0 : Math.sin(t * 0.8 + R) * 0.06;
      const cor = vx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 1.9);
      cor.addColorStop(0, rgba(w.hue, 0.34 + breathe));
      cor.addColorStop(0.45, rgba(w.hue, 0.14));
      cor.addColorStop(1, rgba(w.hue, 0));
      vx.fillStyle = cor;
      vx.beginPath(); vx.arc(0, 0, R * 1.9, 0, TAU); vx.fill();
      // the sphere itself: a deep round shadow with a faint hue limb —
      // the roundness IS the limb gradient, same trick as the planets
      const sph = vx.createRadialGradient(-R * 0.18, -R * 0.2, R * 0.05, 0, 0, R * 0.72);
      sph.addColorStop(0, "rgba(2,3,8,1)");
      sph.addColorStop(0.72, "rgba(2,3,8,.99)");
      sph.addColorStop(0.94, rgba(mix(w.hue, "#000000", 0.45), 0.9));
      sph.addColorStop(1, rgba(w.hue, 0.55));
      vx.fillStyle = sph;
      vx.beginPath(); vx.arc(0, 0, R * 0.72, 0, TAU); vx.fill();
      // tilted accretion band crossing the FACE — in front below, behind above,
      // which is what sells the sphere; doppler-graded across its width
      vx.save(); vx.rotate(-0.42);
      const acc = vx.createLinearGradient(-R * 1.4, 0, R * 1.4, 0);
      acc.addColorStop(0, rgba(mix(w.hue, "#ffffff", 0.55), 0.6));
      acc.addColorStop(0.5, rgba(w.hue, 0.28));
      acc.addColorStop(1, rgba(mix(w.hue, "#000000", 0.3), 0.14));
      vx.strokeStyle = acc; vx.lineWidth = Math.max(1.2, R * 0.13);
      // far side (top arc) first, dimmed — it passes BEHIND the body
      vx.globalAlpha = 0.4;
      vx.beginPath(); vx.ellipse(0, 0, R * 1.06, R * 0.34, 0, Math.PI, TAU); vx.stroke();
      vx.globalAlpha = 1;
      vx.beginPath(); vx.ellipse(0, 0, R * 1.06, R * 0.34, 0, 0, Math.PI); vx.stroke();
      vx.restore();
      vx.restore();
    };
    const emitWormhole = (w: Wormhole, sx: number, sy: number, R: number, t: number, i: number) => {
      if (off(sx, sy, R * 1.6)) return;
      ex.save(); ex.translate(sx, sy);
      // photon ring hugging the spherical shadow — bright, thin, doppler-arced
      ex.strokeStyle = rgba(mix(w.hue, "#ffffff", 0.5), 0.6);
      ex.lineWidth = Math.max(1, R * 0.06);
      ex.beginPath(); ex.arc(0, 0, R * 0.74, 0, TAU); ex.stroke();
      ex.strokeStyle = rgba(mix(w.hue, "#ffffff", 0.75), 0.95);
      ex.lineWidth = Math.max(1.2, R * 0.08);
      ex.beginPath(); ex.arc(0, 0, R * 0.74, Math.PI * 0.7, Math.PI * 1.3); ex.stroke();
      // the band's near-side bloom
      ex.save(); ex.rotate(-0.42);
      ex.strokeStyle = rgba(mix(w.hue, "#ffffff", 0.35), 0.4);
      ex.lineWidth = Math.max(1, R * 0.1);
      ex.beginPath(); ex.ellipse(0, 0, R * 1.06, R * 0.34, 0, 0, Math.PI); ex.stroke();
      ex.restore();
      // the traveller — one bright bead running the rim; parked when reduced
      const u = reduced ? (i * 0.27) % 1 : (t * 0.22 + i * 0.27) % 1;
      const a = u * TAU;
      const bx2 = Math.cos(a) * R * 1.06, by2 = Math.sin(a) * R * 0.34;
      const bead = ex.createRadialGradient(bx2, by2, 0, bx2, by2, R * 0.34);
      bead.addColorStop(0, rgba(mix(w.hue, "#ffffff", 0.6), 0.9));
      bead.addColorStop(1, "rgba(0,0,0,0)");
      ex.fillStyle = bead;
      ex.beginPath(); ex.arc(bx2, by2, R * 0.34, 0, TAU); ex.fill();
      ex.restore();
    };

    const drawScene = (t: number, agents: Agent[]) => {
      vx.clearRect(0, 0, W, H);
      const bg = vx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#04070f"); bg.addColorStop(0.55, "#04060d"); bg.addColorStop(1, "#060811");
      vx.fillStyle = bg; vx.fillRect(0, 0, W, H);

      vx.save(); vx.textAlign = "center"; vx.textBaseline = "middle";
      // Region names ride their arms: each caption anchors on the arm's mid
      // radius and turns with the disc; "founded" tails the youngest arm, so
      // its caption sits on the mean of its own worlds.
      const caption = (name: string, cap: number, ax: number, ay: number) => {
        const [sx, sy] = w2s(ax, ay + 40, 0.92);
        const size = cap * cam.z * 1.9;
        vx.font = `600 ${size}px ui-monospace, Menlo, monospace`;
        // letterSpacing is Chrome-only canvas API; typed loosely on purpose
        const vxl = vx as CanvasRenderingContext2D & { letterSpacing?: string };
        if (vxl.letterSpacing !== undefined) vxl.letterSpacing = `${size * 0.42}px`;
        vx.fillStyle = `rgba(150,185,240,${Math.max(0, 0.05 - Math.abs(cam.z - 0.42) * 0.06)})`;
        vx.fillText(name.toUpperCase(), sx, sy);
      };
      ARMS.forEach((arm) => {
        const members = [...nodes.values()].filter((n) => n.cluster.id === arm.id);
        if (members.length === 0) return;
        const rMid = members.reduce((s, n) => s + n.rG, 0) / members.length;
        const anchor = spiralPos(rMid, armAngleAt(arm.phase, rMid), reduced ? 0 : t);
        caption(arm.name, arm.cap, anchor.x, anchor.y);
      });
      {
        const foundlings = [...nodes.values()].filter((n) => n.cluster.id === FOUNDED.id);
        if (foundlings.length) {
          const ax = foundlings.reduce((s, n) => s + n.x, 0) / foundlings.length;
          const ay = foundlings.reduce((s, n) => s + n.y, 0) / foundlings.length;
          caption(FOUNDED.name, FOUNDED.cap, ax, ay);
        }
      }
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

      // the unseen mass dims the sky it sits in — at its LIVE seat on the
      // binary orbit, before arms and filaments, which may legitimately
      // cross its outer fringe as bent light
      {
        const [hx, hy] = w2s(poseNow().hole.x, poseNow().hole.y);
        paintHole(hx, hy, BLACK_HOLE.r * cam.z, t);
      }

      // the arms themselves, faint: each guide threads its LIVE worlds from
      // the core outward and runs on to its doors, so the curve stays pinned
      // to the bodies however far the differential rotation has swept them
      ARMS.forEach((arm) => {
        const pts = [...nodes.values()]
          .filter((n) => n.armId === arm.id)
          .sort((a, b) => a.rG - b.rG)
          .map((n) => w2s(n.x, n.y));
        WORMHOLES.filter((w) => w.arm === arm.id)
          .sort((a, b) => a.rG - b.rG)
          .forEach((w) => pts.push(w2s(w.x, w.y)));
        if (pts.length < 2) return;
        vx.strokeStyle = "rgba(150,185,240,.07)"; vx.lineWidth = 1;
        vx.beginPath();
        vx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++)
          vx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
        vx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        vx.stroke();
      });

      STRUCTURAL.forEach((edge) => {
        const A = nodes.get(edge.source), B = nodes.get(edge.target);
        if (!A || !B) return;
        const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        // Sway phase from WORLD length — screen length breathes with the zoom
        // ease, and a phase built from it made every filament vibrate while
        // zooming. Amplitude still scales with the screen so it stays subtle.
        const wlen = Math.hypot(B.x - A.x, B.y - A.y) || 1;
        const sway = reduced ? 0 : Math.sin(t * 0.22 + wlen * 0.008) * len * 0.02;
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

      // the sun and the portals sit under the planets, so a world crossing
      // the registry's face occludes it the way it occludes everything else
      {
        const [sx2, sy2] = w2s(poseNow().sun.x, poseNow().sun.y);
        paintSun(sx2, sy2, SUN.r * cam.z, t);
      }
      WORMHOLES.forEach((w) => {
        const [wx2, wy2] = w2s(w.x, w.y);
        paintWormhole(w, wx2, wy2, w.r * cam.z, t);
      });

      drawMoons(agents, "back");
      const order = [...nodes.entries()].sort((a, b) => a[1].z - b[1].z);
      order.forEach(([id, n]) => {
        const sp = spriteFor(id);
        const p = useHub.getState().projects.find((pp) => pp.id === id)!;
        const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        const bob = reduced ? 0 : Math.sin(t * 0.12 + n.x * 0.01) * 2.2 * n.z;
        const sy = syRaw + bob;
        const scale = cam.z * n.z, drawS = sp.S * scale;
        if (sx < -drawS || sx > W + drawS || sy < -drawS || sy > H + drawS) return;
        const dim = 0.55 + (0.45 * Math.min(n.z, 1.06)) / 1.06;
        if (RINGED.has(id)) ringPath(sx, sy, sp.R * scale, p.hue, true);
        // Depth-dim with a dark veil, never alpha — a translucent disc lets
        // moons and stars ghost straight through the planet.
        vx.drawImage(sp.c, sx - drawS / 2, sy - drawS / 2, drawS, drawS);
        if (dim < 0.995) {
          vx.fillStyle = `rgba(4,6,13,${1 - dim})`;
          vx.beginPath(); vx.arc(sx, sy, sp.R * scale, 0, TAU); vx.fill();
        }
        if (RINGED.has(id)) ringPath(sx, sy, sp.R * scale, p.hue, false);
      });
      drawMoons(agents, "front");
    };

    const drawEmissive = (t: number, agents: Agent[]) => {
      ex.clearRect(0, 0, W, H);
      // Celestial light goes down FIRST: the planet-disc punch below occludes
      // the sun's corona and the portals' rims exactly like every far glow.
      {
        const bp = poseNow();
        const [sx2, sy2] = w2s(bp.sun.x, bp.sun.y);
        emitSun(sx2, sy2, SUN.r * cam.z, t);
        const [hx, hy] = w2s(bp.hole.x, bp.hole.y);
        emitHole(hx, hy, BLACK_HOLE.r * cam.z, t);
        WORMHOLES.forEach((w, i) => {
          const [wx2, wy2] = w2s(w.x, w.y);
          emitWormhole(w, wx2, wy2, w.r * cam.z, t, i);
        });
      }
      // Bloom composites this canvas ADDITIVELY over the finished scene, so a
      // glow left here by a moon on the far side of its planet shines straight
      // through the disc. Far-side glows go down first, then every planet disc
      // punches them out — the same occlusion the diffuse pass gets from draw
      // order — and only then does the lit world paint on clean ground.
      agents.forEach((ag, i) => {
        const m = moonState(ag, i);
        if (!m || !m.behind) return;
        const g = ex.createRadialGradient(m.x, m.y, 0, m.x, m.y, 11 * cam.z + 5);
        g.addColorStop(0, rgba(ag.color, 0.35));
        g.addColorStop(1, rgba(ag.color, 0));
        ex.fillStyle = g; ex.beginPath(); ex.arc(m.x, m.y, 11 * cam.z + 5, 0, TAU); ex.fill();
      });
      ex.globalCompositeOperation = "destination-out";
      ex.fillStyle = "#000";
      nodes.forEach((n, id) => {
        const sp = sprites.get(id)!;
        const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        const sy = syRaw + (reduced ? 0 : Math.sin(t * 0.12 + n.x * 0.01) * 2.2 * n.z);
        ex.beginPath(); ex.arc(sx, sy, sp.R * cam.z * n.z, 0, TAU); ex.fill();
      });
      ex.globalCompositeOperation = "source-over";
      nodes.forEach((n, id) => {
        const sp = spriteFor(id);
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
        if (!m || m.behind) return; // far-side glows already down (and occluded)
        const talking = ag.status.kind === "talking";
        const g = ex.createRadialGradient(m.x, m.y, 0, m.x, m.y, 11 * cam.z + 5);
        g.addColorStop(0, rgba(ag.color, talking ? 1 : 0.9));
        g.addColorStop(1, rgba(ag.color, 0));
        ex.fillStyle = g; ex.beginPath(); ex.arc(m.x, m.y, 11 * cam.z + 5, 0, TAU); ex.fill();
      });
      // ── VITAL SIGNS ────────────────────────────────────────────────────
      // What a 30px disc can express is BRIGHTNESS, not texture — so each
      // world's motion at map distance is a light event, and the event is
      // what the project does. The harness runs its loop, gradecore cuts its
      // record, crashkit fractures, the gateway meters traffic. These draw on
      // the emissive layer at screen scale, so they cost a few paths each and
      // no re-bake at all.
      nodes.forEach((n, id) => {
        const sp = spriteFor(id);
        const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
        const sy = syRaw + (reduced ? 0 : Math.sin(t * 0.12 + n.x * 0.01) * 2.2 * n.z);
        const R = sp.R * cam.z * n.z;
        if (R < 3 || sx < -R * 3 || sx > W + R * 3 || sy < -R * 3 || sy > H + R * 3) return;
        const hue = useHub.getState().projects.find((pp) => pp.id === id)?.hue ?? "#60a5fa";
        const beat = reduced ? 0.5 : undefined;
        // One cached glow per colour, drawn as an image. Building a radial
        // gradient per dot per frame cost 28fps across eighteen worlds — the
        // gradient is the expensive part, and it never changes.
        const dot = (dx: number, dy: number, r: number, a: number, col = hue) => {
          if (a <= 0.01 || r <= 0) return;
          ex.globalAlpha = Math.min(1, a);
          ex.drawImage(glowFor(col), sx + dx - r, sy + dy - r, r * 2, r * 2);
          ex.globalAlpha = 1;
        };
        // a slow, per-world breath under everything — nothing sits perfectly still
        const idle = beat ?? 0.5 + 0.5 * Math.sin(t * 0.7 + idSeed(id) % 100);
        switch (id) {
          case "agentic-dev-harness": {
            // the five-stage loop, running: each ring lights in turn
            const stage = beat !== undefined ? 0 : (t * 0.9) % 5;
            for (let k = 0; k < 5; k++) {
              const near = 1 - Math.min(1, Math.abs(((stage - k + 5.5) % 5) - 0.5) * 1.6);
              dot(0, 0, R * (0.45 + k * 0.16), 0.06 + near * 0.3, "#ffca7a");
            }
            break;
          }
          case "gradecore": {
            // the scribe head travelling the record ring, cutting
            const a = (t * 0.55) % TAU;
            dot(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.2, R * 0.5, 0.5, "#ffe1a0");
            break;
          }
          case "crashkit": {
            // fracture events: irregular flares, not a metronome
            const f = Math.max(0, Math.sin(t * 1.6) * Math.sin(t * 0.43 + 1.1));
            dot(0, 0, R * 1.5, 0.1 + f * 0.55, "#ff9a5a");
            break;
          }
          case "model-drift": {
            // the probe pacing its survey line
            const u = (t * 0.22) % 1;
            dot((u - 0.5) * R * 1.7, -R * 0.62, R * 0.42, 0.55, "#cfe4ff");
            break;
          }
          case "eval-dashboard": {
            // the live tile, reporting
            dot(R * 0.1, R * 0.05, R * 0.6, 0.2 + 0.45 * Math.max(0, Math.sin(t * 2.1)), "#8dfff0");
            break;
          }
          case "evals-differential-oracle": {
            // two verdicts disagreeing, alternately
            const odd = Math.sin(t * 1.5) > 0;
            dot(odd ? -R * 0.45 : R * 0.45, -R * 0.2, R * 0.5, 0.5, "#ffc478");
            break;
          }
          case "llm-gateway": {
            // caravans metering through the toll arch
            for (let k = 0; k < 3; k++) {
              const u = ((t * 0.3 + k / 3) % 1);
              dot((u - 0.5) * R * 1.8, R * 0.05, R * 0.3, (1 - Math.abs(u - 0.5) * 2) * 0.5, "#c9ffe4");
            }
            break;
          }
          case "cast-pipeline": {
            // the projector advancing a frame, with the flicker of a lamp
            const fl = 0.35 + 0.5 * Math.abs(Math.sin(t * 3.1));
            dot(0, -R * 0.15, R * 0.55, fl * 0.55, "#fff3cf");
            break;
          }
          case "match3-engine": {
            // a match landing, then the board settling
            const c = (t * 0.5) % 1;
            dot(0, 0, R * (0.5 + c * 1.1), Math.max(0, 0.6 - c * 0.6), "#ffd76a");
            break;
          }
          case "pi-gates": {
            // watch-fires along the curtain wall
            for (let k = 0; k < 3; k++)
              dot((k - 1) * R * 0.55, R * 0.15, R * 0.32, 0.25 + 0.3 * Math.max(0, Math.sin(t * 2.3 + k * 2.1)), "#ffc482");
            break;
          }
          case "agent-graph": {
            // packets crossing the web
            for (let k = 0; k < 2; k++) {
              const u = (t * 0.4 + k * 0.5) % 1;
              dot((u - 0.5) * R * 1.5, (0.5 - u) * R * 0.9, R * 0.3, 0.45, "#dcecff");
            }
            break;
          }
          case "tapdodge-engine": {
            // a run, start to finish, over and over
            const u = (t * 0.35) % 1;
            dot(R * 0.25, (u - 0.5) * R * 1.6, R * 0.34, 0.5, "#eaf6ff");
            break;
          }
          case "rag-eval-lab": {
            // the lighthouse sweeping
            const a = (t * 0.5) % TAU;
            dot(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.55, 0.18 + 0.35 * Math.max(0, Math.cos(a)), "#fff5cc");
            break;
          }
          case "prompt-regress": {
            // the breach, still warm; gates holding steady
            dot(R * 0.15, -R * 0.3, R * 0.5, 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.2)), "#ffb078");
            break;
          }
          case "harness-builder": {
            // the storm turning under its survey
            const a = (t * 0.35) % TAU;
            dot(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.18, R * 0.5, 0.35, "#fff0cd");
            break;
          }
          case "eval-history": {
            // the amber seam, breathing slowly — the run that still matters
            dot(0, R * 0.1, R * 0.7, 0.12 + 0.28 * idle, "#ffc46b");
            break;
          }
          case "pi-eval": {
            // the observatory's open dome, tracking
            dot(R * 0.3, -R * 0.1, R * 0.36, 0.2 + 0.4 * idle, "#dfeaff");
            break;
          }
          case "mcp-tools": {
            // the open bay's beacon
            dot(-R * 0.1, R * 0.05, R * 0.42, 0.18 + 0.4 * Math.max(0, Math.sin(t * 1.7)), "#b8f0ff");
            break;
          }
          default:
            dot(0, 0, R * 0.9, 0.08 + 0.16 * idle);
        }
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

    // Label widths, measured once each. A label is a planet's only click
    // target, so one hanging off the canvas edge is an unreachable project —
    // but offsetWidth every frame for 18 labels is a forced reflow, and the
    // text never changes after creation.
    const labelW = new Map<string, number>();
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
          if (!labelW.has(id) && el.offsetWidth > 0) labelW.set(id, el.offsetWidth);
          const half = (labelW.get(id) ?? 0) / 2;
          el.style.left = `${Math.round(Math.max(half + 4, Math.min(W - half - 4, sx)))}px`;
          el.style.top = `${Math.round(syRaw + below * cam.z * n.z + 13)}px`;
          // Labels fade when zoomed OUT past the fitted view — but the floor
          // has to track that view, not a constant: on a small window the fit
          // lands under 0.3 and every name silently disappeared.
          const floor = Math.min(0.3, home.z * 0.92);
          el.style.opacity = `${cam.z < floor ? 0 : Math.min(1, (cam.z - floor + 0.02) * 6) * (0.55 + 0.45 * n.z)}`;
        }
        const crewNames = agents.filter((a) => assignments[a.id] === id).map((a) => a.name);
        const crewEl = el.querySelector<HTMLSpanElement>(".crew")!;
        crewEl.textContent = crewNames.length ? ` · ${crewNames.length} crew` : "";
        if (crewNames.length) el.title = crewNames.map((nm) => `${nm} is working here`).join(", ");
        else el.removeAttribute("title");
      });
      // celestial labels ride the same projections as their bodies — for the
      // binary that means the LIVE pose, frozen at t = 0 under reduced motion
      const bpLab = poseNow();
      celEls.forEach((el, id) => {
        const b =
          id === "sun" ? { x: bpLab.sun.x, y: bpLab.sun.y, r: SUN.r }
          : id === "hole" ? { x: bpLab.hole.x, y: bpLab.hole.y, r: BLACK_HOLE.r }
          : WORMHOLES.find((w) => w.id === id);
        if (!b) return;
        let x: number, y: number, below: number, o: number;
        if (mode === "3d") {
          const pr = project3(cel3(b));
          if (!pr) { el.style.opacity = "0"; return; }
          x = pr.x; y = pr.y; below = b.r * pr.s * 2.1;
          o = Math.min(1, pr.s * 2.2);
        } else {
          const [sx, sy] = w2s(b.x, b.y);
          x = sx; y = sy; below = b.r * cam.z;
          const floor = Math.min(0.3, home.z * 0.92);
          o = cam.z < floor ? 0 : Math.min(1, (cam.z - floor + 0.02) * 6);
        }
        if (id === "hole") {
          // the void's reveal sits ON the body: the hover area is the effect
          const d = Math.max(30, below * 2.6);
          el.style.width = el.style.height = `${Math.round(d)}px`;
          el.style.left = `${Math.round(x)}px`;
          el.style.top = `${Math.round(y)}px`;
          el.style.opacity = "1";
          return;
        }
        el.style.left = `${Math.round(x)}px`;
        el.style.top = `${Math.round(y + below * 1.15 + 13)}px`;
        el.style.opacity = `${o}`;
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
      // arm guides in 3D — the same live thread the flat map draws, projected
      ARMS.forEach((arm) => {
        const seats = [...nodes.entries()]
          .filter(([, n]) => n.armId === arm.id)
          .sort((a, b) => a[1].rG - b[1].rG)
          .map(([id]) => project3(pos3(id)));
        WORMHOLES.filter((w) => w.arm === arm.id)
          .sort((a, b) => a.rG - b.rG)
          .forEach((w) => seats.push(project3(cel3(w))));
        vx.strokeStyle = "rgba(120,160,230,.10)"; vx.lineWidth = 1;
        vx.beginPath();
        let started = false;
        for (const pr of seats) {
          if (!pr) { started = false; continue; }
          if (!started) { vx.moveTo(pr.x, pr.y); started = true; } else vx.lineTo(pr.x, pr.y);
        }
        vx.stroke();
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
      type Pr = NonNullable<ReturnType<typeof project3>>;
      type Item = { kind: "planet"; id: string; pr: Pr } |
                  { kind: "moon"; ag: Agent; pr: Pr } |
                  { kind: "sun"; pr: Pr } | { kind: "hole"; pr: Pr } |
                  { kind: "wh"; w: Wormhole; i: number; pr: Pr };
      const items: Item[] = [];
      {
        // the constellation rides the same depth sort as everything else —
        // the binary at its live pose, the doors at their fixed rim seats
        const bp = poseNow();
        const ps = project3(cel3(bp.sun));
        if (ps) items.push({ kind: "sun", pr: ps });
        const ph = project3(cel3(bp.hole));
        if (ph) items.push({ kind: "hole", pr: ph });
        WORMHOLES.forEach((w, i) => {
          const pw = project3(cel3(w));
          if (pw) items.push({ kind: "wh", w, i, pr: pw });
        });
      }
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
          const sp = spriteFor(it.id);
          const p = useHub.getState().projects.find((pp) => pp.id === it.id)!;
          const d = sp.S * it.pr.s * 2.1;
          const R = sp.R * it.pr.s * 2.1;
          // Occlude the emissive layer painted so far — bloom would otherwise
          // lift a farther moon's glow straight through this disc.
          ex.globalCompositeOperation = "destination-out";
          ex.fillStyle = "#000";
          ex.beginPath(); ex.arc(it.pr.x, it.pr.y, R, 0, TAU); ex.fill();
          ex.globalCompositeOperation = "source-over";
          vx.drawImage(sp.c, it.pr.x - d / 2, it.pr.y - d / 2, d, d);
          ex.drawImage(sp.e, it.pr.x - d / 2, it.pr.y - d / 2, d, d);
          const g = ex.createRadialGradient(it.pr.x, it.pr.y, R * 0.7, it.pr.x, it.pr.y, R * 1.9);
          g.addColorStop(0, rgba(p.hue, 0.18)); g.addColorStop(1, rgba(p.hue, 0));
          ex.fillStyle = g; ex.beginPath(); ex.arc(it.pr.x, it.pr.y, R * 1.9, 0, TAU); ex.fill();
        } else if (it.kind === "sun") {
          const R = SUN.r * it.pr.s * 2.1;
          paintSun(it.pr.x, it.pr.y, R, tNow);
          emitSun(it.pr.x, it.pr.y, R, tNow);
        } else if (it.kind === "hole") {
          const R = BLACK_HOLE.r * it.pr.s * 2.1;
          paintHole(it.pr.x, it.pr.y, R, tNow);
          emitHole(it.pr.x, it.pr.y, R, tNow);
        } else if (it.kind === "wh") {
          const R = it.w.r * it.pr.s * 2.1;
          paintWormhole(it.w, it.pr.x, it.pr.y, R, tNow);
          emitWormhole(it.w, it.pr.x, it.pr.y, R, tNow, it.i);
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
      // Frame-rate independence. The eases below are written as "fraction per
      // 60fps frame"; on a loaded machine frames are scarce, so applying them
      // per-frame made the camera take proportionally longer in WALL-CLOCK
      // time — visible as sluggishness, and as a settle that misses its
      // deadline under a parallel test run.
      const dt = Math.min(50, now - lastDrawAt);
      const per = (k: number) => 1 - Math.pow(1 - k, dt / 16.667);
      lastDrawAt = now;
      const t = (now - t0) / 1000;
      tNow = t; frame++;
      const agents = s.agents;
      host.dataset.zoom = cam.z.toFixed(3);
      // The camera says for ITSELF whether it has arrived — tests that infer
      // "settled" from two equal rounded reads can be lied to by a value still
      // crossing a rounding boundary. The WHOLE camera, not just zoom: x/y
      // ease slower than z, and "settled" with the pan still creeping misled
      // a position assertion by 3px. Under idle drift x/y chase a moving
      // choreography and never arrive — there, zoom is the only destination.
      // A STAGED world is the same case now: it rides the rotating disc and
      // the camera tracks it, so the pan never lands by construction — the
      // hero zoom is what arrival means.
      host.dataset.zoomSettled = String(
        cam.z === cam.tz && (driftOn || stagedId !== null || (cam.x === cam.tx && cam.y === cam.ty))
      );
      host.dataset.mode = mode;
      const idle = now - lastInput > IDLE_MS;
      if (idle && driftPref && !reduced && !driftOn && !currentRef.current) setDrift(true);
      if (mode === "3d") {
        // Planets ORBIT in 3D — a target set once at click time is a place
        // the planet used to be. While its card is up, follow it round.
        const cur = currentRef.current;
        if (cur && nodes.has(cur)) cam3.ttarget = pos3(cur);
        if (driftOn && (!hoverPause || idle)) cam3.tyaw += 0.0007;
        cam3.yaw += (cam3.tyaw - cam3.yaw) * per(0.08);
        cam3.pitch += (cam3.tpitch - cam3.pitch) * per(0.08);
        cam3.dist += (cam3.tdist - cam3.dist) * per(0.07);
        (["x", "y", "z"] as const).forEach((ax) => { cam3.target[ax] += (cam3.ttarget[ax] - cam3.target[ax]) * per(0.06); });
        spinFrame(currentRef.current);
        draw3D(agents);
      } else {
        // Differential rotation sweeps the disc and the unseen mass signs
        // every orbit that passes near its live seat — positions re-derive
        // from the polar base each frame; under reduced motion the whole
        // field is the frozen t = 0 pose: arms, binary and bends all still.
        advanceWorld(reduced ? 0 : t);
        // The staged world keeps riding the disc — follow it, as 3D does,
        // or the composed hero frame slowly slides off its planet.
        if (stagedId && nodes.has(stagedId)) aimHero(stagedId);
        if (driftOn && !reduced && (!hoverPause || idle)) {
          // the cruise orbits the FITTED home, so it can't wander the system
          // off-screen on a viewport the constant was never chosen for
          cam.tx = home.x + Math.cos(t * 0.04) * 170 * (home.z / HOME.z);
          cam.ty = home.y + Math.sin(t * 0.031) * 110 * (home.z / HOME.z);
        }
        // Eased, but SNAPPED once close: an asymptotic ease never lands, so
        // "the camera settled" would otherwise be false by a millistep forever
        // — visible as label micro-jitter and as a lock that reads as leaking.
        // A FLY is purposeful; the idle drift is languid. One ease constant
        // for both made the trip to a planet take ~3s, which reads as lag
        // rather than cinema.
        const ease = per(currentRef.current ? 0.075 : 0.028);
        cam.x += (cam.tx - cam.x) * ease;
        cam.y += (cam.ty - cam.y) * ease;
        cam.z += (cam.tz - cam.z) * per(currentRef.current ? 0.085 : 0.05);
        if (Math.abs(cam.tx - cam.x) < 0.5) cam.x = cam.tx;
        if (Math.abs(cam.ty - cam.y) < 0.5) cam.y = cam.ty;
        if (Math.abs(cam.tz - cam.z) < 0.0005) cam.z = cam.tz;
        spinFrame(currentRef.current);
        drawScene(t, agents);
        drawEmissive(t, agents);
        bloom(); post();
      }
      positionLabels(agents);
      raf = requestAnimationFrame(loop);
    };
    // ── first paint, synchronously at mount ───────────────────────────────
    // The loop parks while the tab is hidden — and a tab that LOADS in the
    // background never gets a single rAF, so nothing below ever ran: every
    // label sat unpositioned at the host's corner (absolute + translate(-50%)
    // of its own width — the "galaxy collapsed to one point" a background-tab
    // reader measures) and the canvas stayed blank until the first visible
    // frame. Paint once here, unconditionally: the map's DOM and canvas are
    // correct from the moment they exist, whether or not a frame ever fires.
    {
      const agents0 = useHub.getState().agents;
      // the frozen pose, perturbation field included — exactly the state the
      // first reduced-motion frame draws, so the mount paint never snaps
      advanceWorld(0);
      drawScene(0, agents0);
      drawEmissive(0, agents0);
      bloom(); post();
      positionLabels(agents0);
    }
    let raf = requestAnimationFrame(loop);

    // HUD drift wiring is declared below; setDrift is hoisted here so the
    // fly/return closures above it in source order can call it safely.
    // ── input ──
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;
    let downAt = 0, downPos = { x: 0, y: 0 };
    /** Which world is under this point, if any. The canvas is one element, so
        a planet is only clickable if we say what is where — the labels were
        doing that job alone, which meant the disc itself, the biggest thing on
        screen, was inert. */
    const hitPlanet = (clientX: number, clientY: number): string | null => {
      const r = host.getBoundingClientRect();
      const px = clientX - r.left, py = clientY - r.top;
      let best: { id: string; d: number } | null = null;
      if (mode === "3d") {
        nodes.forEach((_n, id) => {
          const pr = project3(pos3(id));
          if (!pr) return;
          const d = Math.hypot(px - pr.x, py - pr.y);
          if (d < spriteFor(id).R * pr.s * 2.1 + 16 && (!best || d < best.d)) best = { id, d };
        });
      } else {
        nodes.forEach((n, id) => {
          const sp = spriteFor(id);
          const [sx, syRaw] = w2s(n.x, n.y, 0.88 + n.z * 0.12);
          const sy = syRaw + (reduced ? 0 : Math.sin(tNow * 0.12 + n.x * 0.01) * 2.2 * n.z);
          const rad = sp.R * cam.z * n.z;
          const d = Math.hypot(px - sx, py - sy);
          if (d <= rad + 4 && (!best || d < best.d)) best = { id, d };
        });
      }
      return best ? (best as { id: string }).id : null;
    };
    /** Sun and wormholes take clicks; the void takes none — a click into the
        hole does exactly what falls into it. Checked before hitPlanet so a
        portal is never mistaken for the world beside it. */
    const hitCel = (clientX: number, clientY: number): { url: string } | null => {
      const rct = host.getBoundingClientRect();
      const px = clientX - rct.left, py = clientY - rct.top;
      const bodies = [
        // the registry is clickable where it IS — its live seat on the orbit
        { x: poseNow().sun.x, y: poseNow().sun.y, r: SUN.r * 1.15, url: SUN.url },
        ...WORMHOLES.map((w) => ({ x: w.x, y: w.y, r: w.r * 1.4, url: w.url })),
      ];
      for (const b of bodies) {
        if (mode === "3d") {
          const pr = project3(cel3(b));
          if (!pr) continue;
          if (Math.hypot(px - pr.x, py - pr.y) <= b.r * pr.s * 2.1 + 10) return { url: b.url };
        } else {
          const [sx, sy] = w2s(b.x, b.y);
          if (Math.hypot(px - sx, py - sy) <= b.r * cam.z + 6) return { url: b.url };
        }
      }
      return null;
    };
    /** The estate rule, enforced at the jump: same tab inside
        egnaro9.github.io — a jump that never leaves his name — and a new tab
        for everything external. */
    const openPortal = (url: string) => {
      if (wormholeTarget(url).newTab) window.open(url, "_blank", "noopener");
      else location.assign(url);
    };
    // A press only counts as a pick if it STARTED on the sky. Without this a
    // press that began on a label or the HUD (where onDown bails early) would
    // be judged against a stale timestamp from some earlier press.
    let pressArmed = false;
    hitRef.current = hitPlanet;

    const onDown = (e: PointerEvent) => {
      noteInput();
      pressArmed = false;
      // While the arrival card is up (or the camera is flying to it) the sky
      // is scenery: scrim events bubble to this host, so without this guard a
      // drag or pick "past the card" still steers the camera underneath it.
      if (currentRef.current) return;
      // Drag arms only on the sky itself. Labels and HUD buttons are children
      // of the host, and pointer CAPTURE here would retarget their click
      // events to the host — a map you can pan from anywhere but whose
      // buttons stop working is worse than one with a smaller drag surface.
      if ((e.target as HTMLElement).closest(".gal-lab, .gal-cel, button")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      driftOn = false;
      atHome = false; // the operator is aiming now; resize must not re-frame
      downAt = performance.now(); downPos = { x: e.clientX, y: e.clientY };
      pressArmed = true;
    };
    const onMove = (e: PointerEvent) => {
      noteInput(); // any cursor motion over the sky counts as presence
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        // not dragging: say whether there is a world or a portal under the cursor
        host.style.cursor =
          !currentRef.current && (hitCel(e.clientX, e.clientY) || hitPlanet(e.clientX, e.clientY)) ? "pointer" : "";
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (lastPinch && !useHub.getState().mapLocked) {
          const k = dist / lastPinch;
          if (mode === "3d") cam3.tdist = Math.max(DIST3.min, Math.min(DIST3.max, cam3.tdist / k));
          else cam.tz = Math.max(FIT_Z.min, Math.min(FIT_Z.max, cam.tz * k));
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
      // A short, unmoved press on a world opens it — in either projection.
      if (pressArmed && !currentRef.current && performance.now() - downAt < 240 &&
        Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 6) {
        const portal = hitCel(e.clientX, e.clientY);
        if (portal) openPortal(portal.url);
        else {
          const hit = hitPlanet(e.clientX, e.clientY);
          if (hit) toggleRef.current(hit);
        }
      }
      pressArmed = false;
    };
    const onWheel = (e: WheelEvent) => {
      noteInput();
      e.preventDefault();
      // The lock's contract, carried over: scroll-zoom is what it freezes.
      // The raised card freezes it too — wheel past the card must be inert.
      if (useHub.getState().mapLocked || currentRef.current) return;
      driftOn = false;
      atHome = false;
      if (mode === "3d") cam3.tdist = Math.max(DIST3.min, Math.min(DIST3.max, cam3.tdist * (e.deltaY > 0 ? 1.12 : 0.9)));
      else cam.tz = Math.max(FIT_Z.min, Math.min(FIT_Z.max, cam.tz * (e.deltaY > 0 ? 0.9 : 1.11)));
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
    const hudZi = () => { if (mode === "3d") cam3.tdist = Math.max(420, cam3.tdist * 0.8); else cam.tz = Math.min(FIT_Z.max, cam.tz * 1.25); };
    const zi = $("[data-hud=zi]"), zo = $("[data-hud=zo]"), fit = $("[data-hud=fit]"),
      drift = $("[data-hud=drift]"), m3d = $("[data-hud=m3d]");
    zi.onclick = () => { noteInput(); if (useHub.getState().mapLocked || currentRef.current) return; atHome = false; if (mode === "3d") cam3.tdist = Math.max(DIST3.min, cam3.tdist * 0.8); else cam.tz = Math.min(FIT_Z.max, cam.tz * 1.25); };
    zo.onclick = () => { noteInput(); if (useHub.getState().mapLocked || currentRef.current) return; atHome = false; if (mode === "3d") cam3.tdist = Math.min(DIST3.max, cam3.tdist * 1.25); else cam.tz = Math.max(FIT_Z.min, cam.tz * 0.8); };
    fit.onclick = () => {
      noteInput();
      if (currentRef.current) return; // mid-fly, the fly owns the camera
      atHome = true;
      if (mode === "3d") {
        const f3 = fit3();
        cam3.ttarget = f3.target; cam3.tdist = f3.dist;
      } else {
        home = fitMap();
        cam.tx = home.x; cam.ty = home.y; cam.tz = home.z;
      }
    };
    const setDrift = (v: boolean) => {
      driftOn = v;
      drift.style.color = v ? "#5eead4" : "#8ea0bd";
    };
    drift.onclick = () => { noteInput(); if (currentRef.current) return; driftPref = !driftPref; setDrift(driftPref); };
    setDrift(driftOn);
    // Re-frame on resize now that the solvers exist: a window drag re-fits a
    // view the operator hasn't aimed, and never yanks one they have.
    // sizeAll() wipes the backing store (assigning canvas.width clears even at
    // an unchanged value), and a parked loop — hidden tab, covered stage —
    // never repaints it. The initial ResizeObserver callback lands AFTER the
    // mount paint, so without this a background tab shows a void where the
    // mount paint put a galaxy: the same contract as the mount paint, owed on
    // every resize path.
    const paintParked = () => {
      if (!document.hidden && useHub.getState().stage.kind === "graph") return;
      cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz;
      const a = useHub.getState().agents;
      advanceWorld(reduced ? 0 : tNow);
      drawScene(tNow, a); drawEmissive(tNow, a); bloom(); post();
      positionLabels(a);
    };
    onResize = () => {
      sizeAll();
      home = fitMap();
      // A raised card owns the camera: re-aim it for the new canvas instead of
      // leaving the world at a screen position chosen for the old one.
      const staged = stagedId ?? currentRef.current;
      if (staged) { aimHero(staged); paintParked(); return; }
      if (!atHome) { paintParked(); return; }
      cam.tx = home.x; cam.ty = home.y; cam.tz = home.z;
      if (mode === "3d") { const f3 = fit3(); cam3.ttarget = f3.target; cam3.tdist = f3.dist; }
      paintParked();
    };

    m3d.onclick = () => {
      noteInput();
      if (currentRef.current) return; // no mode flips under a raised card
      mode = mode === "map" ? "3d" : "map";
      // entering 3D frames the whole system for THIS viewport
      if (mode === "3d" && atHome) { const f3 = fit3(); cam3.ttarget = f3.target; cam3.tdist = f3.dist; }
      setDrift(driftPref && !reduced);
      m3d.style.color = mode === "3d" ? "#5eead4" : "#c3d0e5";
      m3d.textContent = mode === "3d" ? "MAP" : "3D";
      labelHost.querySelectorAll<HTMLElement>(".gal-lab .m,.gal-lab .rule").forEach((el2) => {
        el2.style.display = mode === "3d" ? "none" : "";
      });
    };
    void hudZi;

    // Which world is staged, tracked IMPERATIVELY. currentRef mirrors React
    // state, so it is null for the instant between asking for a planet and
    // React committing the card — and leaving a project shrinks the command
    // strip, which resizes this canvas inside exactly that window. The resize
    // handler then saw "no card" and aimed home, overriding the fly.
    let stagedId: string | null = null;
    let arriveTimer: ReturnType<typeof setTimeout> | null = null;
    // THE ARRIVAL IS COMPOSED, not centred. With the card centred it covered
    // the very planet the trip was for. On a wide canvas the world takes the
    // left third at a consistent hero size and the card takes the right; on a
    // narrow one there is no room to stage that, so it stays centred and the
    // card floats over it as before.
    const arriveSide = () => W >= SIDE_MIN_W;
    const heroFrame = (id: string) => {
      const sp = sprites.get(id)!, n = nodes.get(id)!;
      // every world arrives the same visual size — a small planet is not a
      // lesser event than a big one, it just has less mass in the system
      const heroR = Math.min(W, H) * (arriveSide() ? 0.175 : 0.16);
      // Ceiling 2.2, not FIT_Z.max: at the spread-out arm spacing a 3.1 hero
      // zoom put every neighbouring world off-frame, and the scrim's
      // step-to-a-neighbour affordance (galaxy.spec step test) had nothing
      // left to offer. The hero reads a touch smaller; the neighbourhood
      // stays real.
      const z = Math.max(0.9, Math.min(2.2, heroR / Math.max(1, sp.R * n.z)));
      // The planet takes the half AWAY from the galactic core, so the open
      // half faces where its neighbours actually are. A fixed left seat
      // pointed the camera at empty rim-space for every world on the core's
      // right — the neighbourhood clamped its labels to the edge and the
      // step-to-a-neighbour affordance starved. The card mirrors via
      // data-arrive="side-left".
      const side = !arriveSide() ? "center" : GALAXY_CENTER.x >= n.x ? "side" : "side-left";
      host.dataset.arrive = side;
      const tx = side === "center" ? W * 0.5 : side === "side" ? W * 0.25 : W * 0.75;
      const ty = arriveSide() ? H * 0.5 : H * 0.42;
      // The scrim promises a step to a neighbour — so the frame must CONTAIN
      // one. Nearest-neighbour gaps run 319–442 world px (measured), and at a
      // fixed hero zoom whether one lands in the open half depends on its
      // direction versus the card. Back the zoom off (never past 0.9) until
      // one of the six nearest worlds provably sits in-frame and clear of
      // the card — the same test the scrim's own sweep applies. Margins
      // absorb parallax (per-node p spread ≈ 0.04) and the perturb field.
      const cardW2 = side === "center" ? Math.min(640, W * 0.86) : Math.min(400, W * 0.54);
      const pad2 = W * 0.045;
      const cardX = side === "side" ? { x0: W - pad2 - cardW2, x1: W - pad2 }
        : side === "side-left" ? { x0: pad2, x1: pad2 + cardW2 }
        : { x0: (W - cardW2) / 2, x1: (W + cardW2) / 2 };
      const cy0 = H / 2 - 170, cy1 = H / 2 + 170;
      const near = [...nodes.entries()]
        .filter(([mid]) => mid !== id)
        .map(([, m]) => ({ dx: m.x - n.x, dy: m.y - n.y, d: Math.hypot(m.x - n.x, m.y - n.y) }))
        .sort((a, b) => a.d - b.d).slice(0, 6);
      const reachable = (zc: number) => near.some((m) => {
        const px = tx + m.dx * zc, py = ty + m.dy * zc;
        return px > 70 && px < W - 70 && py > 70 && py < H - 70 &&
          !(px > cardX.x0 - 12 && px < cardX.x1 + 12 && py > cy0 && py < cy1);
      });
      // Floor 1.55, not 0.9: the suite's other contract says a hero IS a
      // zoom-in (breadcrumb test pins > 1.5). Between the two promises the
      // zoom-in wins; a world whose whole neighbourhood hides behind the
      // card at 1.55 arrives without a step affordance, and that is the
      // honest residue.
      let zA = z;
      while (zA > 1.55 && !reachable(zA)) zA -= 0.05;
      return { z: zA, tx, ty };
    };

    /** Aim the camera so this world sits in its side of the composition. The
        frame depends on the CANVAS size, so a resize with a card up has to
        re-aim — otherwise the planet keeps the screen position it was given
        for the old width and drifts out of its half. */
    const aimHero = (id: string) => {
      const n = nodes.get(id);
      if (!n) return;
      const { z, tx, ty } = heroFrame(id);
      if (mode === "3d") {
        const pp = pos3(id);
        const dist = 470;
        // slide the aim along the camera's own right axis so the body lands in
        // the left third — the same composition the flat map gets
        const off = (W / 2 - tx) * dist / F3;
        cam3.ttarget = { x: pp.x + Math.cos(cam3.tyaw) * off, y: pp.y, z: pp.z - Math.sin(cam3.tyaw) * off };
        cam3.tdist = dist;
      } else {
        // Planets render through a parallax factor; aim the camera at the
        // point that puts THIS planet where the composition wants it, not at
        // the raw world coordinate — the difference is (1-p)·x, dozens of px.
        const par = 0.88 + n.z * 0.12;
        cam.tz = z;
        cam.tx = (n.x - (tx - W / 2) / z) / par;
        cam.ty = (n.y - (ty - H / 2) / z) / par;
      }
      // If the map has not been painting, we are arriving from a project
      // stage — there is no motion to be continuous WITH, and easing from the
      // wide view means the card lands seconds before its planet does. Land
      // the camera where the composition wants it and let the card meet it.
      if (performance.now() - lastDrawAt > 250) {
        cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz;
        cam3.dist = cam3.tdist;
        cam3.target = { ...cam3.ttarget };
        cam3.yaw = cam3.tyaw; cam3.pitch = cam3.tpitch;
      }
    };

    flyRef.current = (id: string) => {
      if (!nodes.has(id)) return;
      stagedId = id;
      setArrival(null); // swapping: the old card leaves before the new lands
      driftOn = false;
      aimHero(id);
      setFlying(id);
      if (arriveTimer) clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => setArrival(id), reduced ? 0 : 560);
    };
    returnRef.current = () => {
      stagedId = null;
      if (arriveTimer) clearTimeout(arriveTimer);
      setFlying(null); setArrival(null);
      setDrift(driftPref && !reduced);
      atHome = true;
      // leaving a planet lands on the FITTED wide view, not a constant
      if (mode === "3d") { const f3 = fit3(); cam3.ttarget = f3.target; cam3.tdist = f3.dist; }
      else { home = fitMap(); cam.tx = home.x; cam.ty = home.y; cam.tz = home.z; }
    };

    return () => {
      disposed = true;
      if (arriveTimer) clearTimeout(arriveTimer);
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
  const hudOpen = useChrome((s) => s.hud);
  // Selectors return STABLE references only — a fresh .filter() array per
  // getSnapshot is the documented infinite-loop trap this repo already ate
  // once. Derivations happen after the hook, on referentially-stable slices.
  const arrivalProject = useHub((s) => (arrival ? s.projects.find((p) => p.id === arrival) : undefined));
  const allAgents = useHub((s) => s.agents);
  const assignmentsMap = useHub((s) => s.assignments);
  const crew = arrival
    ? allAgents.filter((a) => assignmentsMap[a.id] === arrival).map((a) => a.name)
    : [];
  const enter = (mode: "overview" | "work") => {
    if (!arrival) return;
    const hub = useHub.getState();
    hub.openStage(arrival);
    if (mode === "work") hub.setProjectMode("work");
    // The card clears and the camera eases home behind the stage, so leaving
    // the project lands back on the wide galaxy, not zoomed into one planet.
    returnRef.current();
  };
  const planetRequest = useHub((s) => s.planetRequest);
  useEffect(() => {
    if (planetRequest) toggleRef.current(planetRequest.id);
  }, [planetRequest]);

  // Escape backs out of the card the way it backs out of everything else.
  useEffect(() => {
    if (!arrival && !flying) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") returnRef.current();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [arrival, flying]);

  return (
    <div ref={hostRef} data-testid="galaxy" className="relative h-full w-full overflow-hidden select-none">
      {/* Arrival: the sky stays legible on purpose. The planet you flew to is
          the whole reason for the trip, and the card is translucent — heavy
          blur was hiding the one moment a world renders large. A light dim is
          all the separation the card needs. */}
      <div className={`absolute inset-0 transition-[filter] duration-700 ${flying ? "blur-[0.5px] brightness-[.82] saturate-[1.1]" : ""}`}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      {/* vignette that deepens during the fly */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${flying ? "opacity-100" : "opacity-0"}`}
        style={{ background: "radial-gradient(ellipse at 50% 44%, transparent 40%, rgba(2,4,10,.34) 72%, rgba(2,4,10,.82) 100%)" }}
      />
      {/* arrival card — the mock flow Erik asked back: planet → card → mode */}
      {arrival && arrivalProject && (
        <div
          data-testid="arrival-scrim"
          className="gal-scrim absolute inset-0 z-30 flex items-center"
          onClick={(e) => {
            // The sky behind a card is not just a dismiss target — the
            // neighbours are right there, and being unable to step to one
            // without backing all the way out was busywork. A world under the
            // pointer swaps the card to it; empty space still lowers it.
            const hit = hitRef.current(e.clientX, e.clientY);
            if (hit && hit !== arrival) flyRef.current(hit);
            else returnRef.current();
          }}
          onMouseMove={(e) => {
            const hit = hitRef.current(e.clientX, e.clientY);
            (e.currentTarget as HTMLDivElement).style.cursor = hit && hit !== arrival ? "pointer" : "";
          }}
        >
          <div
            data-testid="arrival-card"
            role="dialog"
            aria-label={`${arrivalProject.name} — choose a mode`}
            onClick={(e) => e.stopPropagation()}
            className="gal-card glass w-[min(640px,86%)] overflow-hidden rounded-2xl"
            style={{ animation: "gal-arrive .45s cubic-bezier(.2,.8,.2,1)" }}
          >
            <div className="h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${arrivalProject.hue}, transparent)` }} />
            <div className="p-7">
              <div className="mono text-[8.5px] tracking-[0.34em] text-slate-500 uppercase">
                project world · {clusterName(CLUSTER_OF[arrival] ?? FOUNDED.id)}
              </div>
              <div className="mt-3 flex items-baseline gap-3.5">
                <div className="text-[26px] font-semibold tracking-tight text-slate-100">{arrivalProject.name}</div>
                <div className="mono text-[9px] tracking-[0.14em] text-slate-500 uppercase">
                  {crew.length ? crew.join(" · ") : "no crew"}
                </div>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{arrivalProject.tagline}</p>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => returnRef.current()}
                  className="mono cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-[10.5px] tracking-[0.08em] text-slate-400 uppercase transition hover:text-slate-200"
                >
                  ← constellation
                </button>
                <button
                  autoFocus
                  onClick={() => enter("overview")}
                  className="mono cursor-pointer rounded-lg border px-3.5 py-1.5 text-[10.5px] tracking-[0.08em] uppercase transition hover:brightness-125"
                  style={{ borderColor: `${arrivalProject.hue}80`, background: `${arrivalProject.hue}17`, color: arrivalProject.hue }}
                >
                  Overview
                </button>
                <button
                  onClick={() => enter("work")}
                  className="mono cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-[10.5px] tracking-[0.08em] text-slate-300 uppercase transition hover:bg-white/10"
                >
                  Work
                </button>
              </div>
              <div className="mt-5 border-t border-white/8 pt-4">
                {(arrivalProject.liveActivity ?? arrivalProject.activity).slice(0, 2).map((line) => (
                  <div key={line} className="mono py-0.5 text-[10px] tracking-[0.03em] text-slate-500">
                    <span style={{ color: `${arrivalProject.hue}cc` }}>▹</span>  {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="glass absolute right-4 bottom-4 z-20 flex gap-2 rounded-xl px-2.5 py-2">
        {/* Collapse hides the cluster with CSS, never unmounts it: the frame
            loop wires these buttons by element reference once per bake — a
            remounted button would come back deaf. */}
        <div className={hudOpen ? "flex gap-2" : "hidden"}>
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
        <button
          aria-label={hudOpen ? "Collapse map controls" : "Expand map controls"}
          aria-expanded={hudOpen}
          onClick={() => useChrome.getState().toggle("hud")}
          className="gal-hbtn"
        >
          {hudOpen ? "⌄" : "⌃"}
        </button>
      </div>
    </div>
  );
}
