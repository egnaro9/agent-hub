/* ════════════════════════════════════════════════════════════════════════════
   EIGHTEEN WORLDS, EIGHTEEN SURFACES.

   Every project's planet is individualized the way its overview world and its
   card are: the surface program is derived from what the project actually IS,
   not from a shared archetype with a different seed. The bake in GalaxyCanvas
   still owns the physics — base sphere, crescent light, clip, axial tilt,
   terminator, limb — a painter only writes the surface (g) and the features
   that should BLOOM (ge). Both contexts arrive pre-clipped and pre-tilted.

   The rule of the file: each signature must be readable at map size. One or
   two bold features per world beats five subtle ones.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PaintCtx {
  g: CanvasRenderingContext2D;   // diffuse surface
  ge: CanvasRenderingContext2D;  // emissive map (feeds the bloom pass)
  cx: number;
  cy: number;
  R: number;
  hue: string;
  rnd: () => number;
  fbm: (x: number, y: number) => number;
  rgba: (h: string, a: number) => string;
  mix: (h1: string, h2: string, k: number) => string;
  LIGHT: { x: number; y: number };
  TAU: number;
}

type Painter = (p: PaintCtx) => void;

/* ── shared strokes ────────────────────────────────────────────────────── */

/** Latitude row bounded by the sphere: returns half-width at a given y. */
const chord = (R: number, y: number) => Math.sqrt(Math.max(0, 1 - (y / R) * (y / R))) * R;

const softBands = (p: PaintCtx, count: number, alpha: number) => {
  const { g, cx, cy, R, fbm } = p;
  for (let y = -R; y < R; y += 1.4) {
    const lat = y / R, sq = chord(R, y);
    const wob = fbm(3.2 + lat * 2.6, lat * 5.5) * 2;
    const tone = Math.sin(lat * count + wob * 2);
    g.fillStyle = tone > 0 ? `rgba(255,255,255,${alpha * Math.abs(tone)})` : `rgba(4,6,16,${alpha * 1.3 * Math.abs(tone)})`;
    g.fillRect(cx - sq, cy + y, sq * 2, 1.8);
  }
};

/* ── the eighteen ──────────────────────────────────────────────────────── */

export const PAINTERS: Record<string, Painter> = {
  /** THE SHARED ENGINE — everything grades through it. The equator carries a
   *  suite-hash fingerprint: an irregular barcode band, softly alight, because
   *  the fingerprint is the product. */
  gradecore(p) {
    const { g, ge, cx, cy, R, rnd, rgba, mix, hue } = p;
    softBands(p, 7, 0.08);
    // the fingerprint band
    let x = cx - chord(R, 0);
    const bandH = R * 0.16;
    while (x < cx + chord(R, 0)) {
      const w = 1 + rnd() * R * 0.05;
      const on = rnd() < 0.55;
      if (on) {
        g.fillStyle = `rgba(255,255,255,${0.28 + rnd() * 0.3})`;
        g.fillRect(x, cy - bandH / 2, w, bandH);
        ge.fillStyle = rgba(mix(hue, "#ffffff", 0.5), 0.30 + rnd() * 0.2);
        ge.fillRect(x, cy - bandH / 2, w, bandH);
      } else {
        g.fillStyle = "rgba(3,5,12,.5)";
        g.fillRect(x, cy - bandH / 2, w, bandH);
      }
      x += w + 0.6;
    }
    // band edges, ruled
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 0.8;
    [-1, 1].forEach((s) => {
      g.beginPath(); g.moveTo(cx - chord(R, s * bandH / 2), cy + (s * bandH) / 2);
      g.lineTo(cx + chord(R, s * bandH / 2), cy + (s * bandH) / 2); g.stroke();
    });
  },

  /** CRASH CHAMBER — a deliberately battered world: dark crust, molten crack
   *  web, and impact scars whose rims still glow. */
  crashkit(p) {
    const { g, ge, cx, cy, R, rnd, TAU } = p;
    g.fillStyle = "rgba(4,4,10,.62)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const crack = (x: number, y: number, dir: number, depth: number, w: number) => {
      if (depth <= 0) return;
      for (let k = 0; k < 4 + Math.floor(rnd() * 4); k++) {
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
    for (let i = 0; i < 8; i++) crack(cx + (rnd() - 0.5) * R, cy + (rnd() - 0.5) * R, rnd() * TAU, 2, 1.5);
    // impact scars: dark bowls with ember rims
    for (let i = 0; i < 4; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.7;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, cr = R * (0.09 + rnd() * 0.08);
      g.fillStyle = "rgba(2,3,8,.75)";
      g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fill();
      for (const [ctx2, al] of [[g, 0.8], [ge, 0.65]] as const) {
        ctx2.strokeStyle = `rgba(255,160,100,${al})`; ctx2.lineWidth = 1.1;
        ctx2.beginPath(); ctx2.arc(x, y, cr, 0, TAU); ctx2.stroke();
      }
    }
  },

  /** THE DRIFT — a banded atmosphere visibly SHEARED at a fault: the same
   *  band arrives offset on the far side, which is the whole product: the
   *  suite is frozen, the model moved. Probe specks ride the bands. */
  "model-drift"(p) {
    const { g, ge, cx, cy, R, rnd, fbm, rgba, mix, hue } = p;
    const faultX = cx + R * 0.12;
    for (let y = -R; y < R; y += 1.5) {
      const lat = y / R, sq = chord(R, y);
      const wob = fbm(2.8 + lat * 3, lat * 6) * 2;
      const tone = Math.sin(lat * 9 + wob * 2);
      const toneShift = Math.sin((lat + 0.16) * 9 + wob * 2); // sheared phase
      const L = cx - sq, W1 = Math.max(0, faultX - L), W2 = Math.max(0, sq * 2 - W1);
      g.fillStyle = tone > 0 ? `rgba(255,255,255,${0.10 * Math.abs(tone)})` : `rgba(4,6,16,${0.16 * Math.abs(tone)})`;
      g.fillRect(L, cy + y, W1, 1.9);
      g.fillStyle = toneShift > 0 ? `rgba(255,255,255,${0.10 * Math.abs(toneShift)})` : `rgba(4,6,16,${0.16 * Math.abs(toneShift)})`;
      g.fillRect(faultX, cy + y, W2, 1.9);
    }
    // the fault line itself, faintly alight — the discontinuity is the point
    for (const [ctx2, al, lw] of [[g, 0.4, 1], [ge, 0.35, 2]] as const) {
      ctx2.strokeStyle = rgba(mix(hue, "#ffffff", 0.5), al); ctx2.lineWidth = lw;
      ctx2.beginPath(); ctx2.moveTo(faultX, cy - chord(R, 0) * 0.9);
      ctx2.lineTo(faultX, cy + chord(R, 0) * 0.9); ctx2.stroke();
    }
    // daily probes: a run of tiny watchers along one band
    for (let i = 0; i < 9; i++) {
      const x = cx - R * 0.8 + i * R * 0.18, y = cy - R * 0.34 + Math.sin(i) * 2;
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R * 0.92) continue;
      ge.fillStyle = rgba(mix(hue, "#ffffff", 0.6), 0.5);
      ge.fillRect(x, y, 1.6, 1.6);
    }
  },

  /** GROUNDED ARCHIPELAGO — an ocean of retrieval with islands of grounded
   *  answers… and ONE island glowing the wrong colour: the planted
   *  hallucination, caught. */
  "rag-eval-lab"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    // swell
    for (let i = 0; i < 6; i++) {
      const y = cy - R + rnd() * 2 * R, sw = R * (0.5 + rnd() * 0.8);
      const lg = g.createLinearGradient(cx - sw, y, cx + sw, y);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, `rgba(255,255,255,${0.07 + rnd() * 0.06})`);
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.beginPath(); g.ellipse(cx, y, sw, R * 0.05, 0, 0, TAU); g.fill();
    }
    // the archipelago
    const isles: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const a = -0.7 + i * 0.32 + (rnd() - 0.5) * 0.2, rr = R * (0.32 + rnd() * 0.38);
      isles.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * (0.05 + rnd() * 0.05)]);
    }
    isles.forEach(([x, y, s], i) => {
      const liar = i === 4;
      g.fillStyle = liar ? "rgba(251,113,133,.85)" : "rgba(214,236,255,.8)";
      g.beginPath(); g.ellipse(x, y, s * 1.4, s * 0.8, rnd(), 0, TAU); g.fill();
      ge.fillStyle = liar ? "rgba(251,113,133,.8)" : rgba(mix(hue, "#ffffff", 0.55), 0.35);
      ge.beginPath(); ge.arc(x, y, s * (liar ? 1.6 : 1.0), 0, TAU); ge.fill();
    });
  },

  /** STRATA — Postgres memory as geology: sedimentary layers, one exposed
   *  unconformity where the record was folded, and faint fossil spirals. */
  "eval-history"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    for (let y = -R; y < R; y += R * 0.11) {
      const sq = chord(R, y);
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "6,8,18"},${0.07 + rnd() * 0.08})`;
      g.fillRect(cx - sq, cy + y, sq * 2, R * 0.11 * (0.5 + rnd() * 0.5));
      g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(cx - sq, cy + y); g.lineTo(cx + sq, cy + y); g.stroke();
    }
    // the unconformity: strata cut by a tilted discordant seam
    g.save(); g.translate(cx + R * 0.24, cy - R * 0.1); g.rotate(0.5);
    g.fillStyle = "rgba(6,8,18,.5)";
    g.fillRect(-R * 0.5, -R * 0.05, R, R * 0.1); g.restore();
    // fossils: two spirals
    for (let f = 0; f < 2; f++) {
      const x = cx + (rnd() - 0.5) * R, y = cy + (rnd() - 0.5) * R;
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R * 0.7) continue;
      g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 0.7;
      g.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.3) g.lineTo(x + Math.cos(a) * a * R * 0.008, y + Math.sin(a) * a * R * 0.008);
      g.stroke();
      ge.strokeStyle = rgba(mix(hue, "#ffffff", 0.4), 0.25); ge.lineWidth = 1.2;
      ge.beginPath(); ge.arc(x, y, R * 0.05, 0, TAU); ge.stroke();
    }
  },

  /** FACET ICE — metric cards as crystal plates: the surface is cut into
   *  panels whose edges catch the light. */
  "eval-dashboard"(p) {
    const { g, ge, cx, cy, R, rnd, rgba, mix, hue } = p;
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // facet chords
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI, off = (rnd() - 0.5) * R * 1.2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const px = cx - dy * off, py = cy + dx * off;
      for (const [ctx2, al, lw] of [[g, 0.34, 0.9], [ge, 0.18, 1.6]] as const) {
        ctx2.strokeStyle = al === 0.34 ? `rgba(255,255,255,${al})` : rgba(mix(hue, "#ffffff", 0.6), al);
        ctx2.lineWidth = lw;
        ctx2.beginPath(); ctx2.moveTo(px - dx * R * 1.5, py - dy * R * 1.5);
        ctx2.lineTo(px + dx * R * 1.5, py + dy * R * 1.5); ctx2.stroke();
      }
      // one side of each chord slightly toned = plates, not lines
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "8,10,22"},.05)`;
      g.save(); g.beginPath();
      g.moveTo(px - dx * R * 1.5, py - dy * R * 1.5);
      g.lineTo(px + dx * R * 1.5, py + dy * R * 1.5);
      g.lineTo(px + dx * R * 1.5 - dy * R, py + dy * R * 1.5 + dx * R);
      g.lineTo(px - dx * R * 1.5 - dy * R, py - dy * R * 1.5 + dx * R);
      g.closePath(); g.fill(); g.restore();
    }
  },

  /** THE GATE WALL — a merge gate as planetary architecture: one great wall
   *  crossing the world, bright-edged, with a single lit breach where green
   *  builds pass. */
  "prompt-regress"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    // mottled rock
    for (let i = 0; i < 140; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.95;
      g.fillStyle = rnd() < 0.5 ? `rgba(3,5,12,${0.05 + rnd() * 0.07})` : `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
      g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.5 + rnd() * R * 0.02, 0, TAU); g.fill();
    }
    // the wall: a great-circle band, tilted
    g.save(); g.translate(cx, cy); g.rotate(-0.45);
    const wallW = R * 0.09;
    g.fillStyle = "rgba(6,8,16,.65)";
    g.fillRect(-R, -wallW / 2, 2 * R, wallW);
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-R, -wallW / 2); g.lineTo(R, -wallW / 2); g.stroke();
    g.beginPath(); g.moveTo(-R, wallW / 2); g.lineTo(R, wallW / 2); g.stroke();
    g.restore();
    ge.save(); ge.translate(cx, cy); ge.rotate(-0.45);
    ge.strokeStyle = rgba(mix(hue, "#ffffff", 0.4), 0.22); ge.lineWidth = wallW * 1.2;
    ge.beginPath(); ge.moveTo(-R, 0); ge.lineTo(R, 0); ge.stroke();
    // the one open gate — passing is the exception that glows
    ge.fillStyle = rgba(mix(hue, "#ffffff", 0.7), 0.9);
    ge.beginPath(); ge.arc(R * 0.22, 0, wallW * 0.55, 0, TAU); ge.fill();
    ge.restore();
  },

  /** GEODESIC — deterministic grading as cartography: a pristine ice world
   *  etched with an exact grid. Nothing decorative; the precision IS the
   *  identity. One meridian runs bright: the fixed predicate. */
  "pi-eval"(p) {
    const { g, ge, cx, cy, R, rgba, mix, hue, TAU } = p;
    g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 0.6;
    for (let i = -3; i <= 3; i++) {
      const yy = cy + (i * R) / 3.6, sq = chord(R, (i * R) / 3.6);
      g.beginPath(); g.ellipse(cx, yy, sq, sq * 0.12, 0, 0, TAU); g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.ellipse(cx, cy, R * Math.abs(Math.cos((i / 6) * Math.PI)), R, 0, 0, TAU); g.stroke();
    }
    // the fixed meridian
    for (const [ctx2, al, lw] of [[g, 0.5, 1], [ge, 0.4, 2]] as const) {
      ctx2.strokeStyle = rgba(mix(hue, "#ffffff", 0.55), al); ctx2.lineWidth = lw;
      ctx2.beginPath(); ctx2.ellipse(cx, cy, R * 0.35, R, 0, 0, TAU); ctx2.stroke();
    }
  },

  /** FIVE RINGS CITY — the loop that reviews itself, urbanized: night-side
   *  city light arranged in five concentric rings. Strategy at the centre,
   *  Ops at the edge, and the lights only on the dark limb — the harness
   *  works while the sun is elsewhere. */
  "agentic-dev-harness"(p) {
    const { g, ge, cx, cy, R, rnd, LIGHT, TAU } = p;
    g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.ellipse(cx, cy, R * Math.abs(Math.cos((i / 6) * Math.PI)), R, 0, 0, TAU); g.stroke();
    }
    const da = Math.atan2(-LIGHT.y, -LIGHT.x);
    const hx = cx + Math.cos(da) * R * 0.42, hy = cy + Math.sin(da) * R * 0.42;
    for (let ring = 0; ring < 5; ring++) {
      const rr = R * (0.08 + ring * 0.12);
      const dots = 8 + ring * 7;
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * TAU + ring * 0.6;
        const x = hx + Math.cos(a) * rr, y = hy + Math.sin(a) * rr * 0.7;
        if ((x - cx) ** 2 + (y - cy) ** 2 > R * R * 0.92) continue;
        if (rnd() < 0.18) continue; // imperfect grids read as lived-in
        const warm = rnd() < 0.75;
        const col = warm ? "255,214,150" : "170,220,255";
        const al = 0.35 + rnd() * 0.45;
        g.fillStyle = `rgba(${col},${al})`; g.fillRect(x, y, 1, 1);
        ge.fillStyle = `rgba(${col},${al * 0.85})`; ge.fillRect(x, y, 1.3, 1.3);
      }
    }
  },

  /** THE REFUSAL FORTRESS — fail-closed as architecture: dark basalt,
   *  walled polygonal compounds, and every gate point dark except one —
   *  the operator's, and it is the only way in. */
  "pi-gates"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    g.fillStyle = "rgba(5,5,12,.5)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    for (let c = 0; c < 5; c++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.62;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, s = R * (0.12 + rnd() * 0.12);
      const sides = 5 + Math.floor(rnd() * 3);
      g.strokeStyle = "rgba(255,255,255,.30)"; g.lineWidth = 0.9;
      g.beginPath();
      for (let i = 0; i <= sides; i++) {
        const aa = (i / sides) * TAU + c;
        const px = x + Math.cos(aa) * s, py = y + Math.sin(aa) * s * 0.75;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
      // sealed gates: dark notches on the walls
      g.fillStyle = "rgba(2,3,8,.9)";
      g.fillRect(x + s * 0.6, y - 1, 2.5, 2);
    }
    // the ONE live gate
    ge.fillStyle = rgba(mix(hue, "#ffffff", 0.6), 0.95);
    ge.beginPath(); ge.arc(cx - R * 0.2, cy + R * 0.28, R * 0.035, 0, TAU); ge.fill();
    g.fillStyle = rgba(mix(hue, "#ffffff", 0.7), 0.9);
    g.beginPath(); g.arc(cx - R * 0.2, cy + R * 0.28, R * 0.03, 0, TAU); g.fill();
  },

  /** RINGED SURVEYOR — draw a harness, sweep it, measure. Banded amber with
   *  its great pale storm (the 22× result), and survey contour lines laid
   *  over the bands — the instrument measuring its own weather. */
  "harness-builder"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    softBands(p, 8, 0.1);
    // survey contours
    g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const y = cy - R * 0.5 + i * R * 0.5, sq = chord(R, y - cy);
      g.beginPath();
      for (let x = -sq; x <= sq; x += 4) {
        const yy = y + Math.sin(x * 0.08 + i * 2) * R * 0.03;
        x === -sq ? g.moveTo(cx + x, yy) : g.lineTo(cx + x, yy);
      }
      g.stroke();
      // tick marks: it is being MEASURED
      for (let x = -sq * 0.9; x <= sq * 0.9; x += sq * 0.3) {
        g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(cx + x, y - 2); g.lineTo(cx + x, y + 2); g.stroke();
      }
    }
    // the storm — the famous result, pale and unmissable
    const sxp = cx + R * 0.3, syp = cy + R * 0.32;
    for (const [ctx2, coreA, size] of [[g, 0.9, 0.3], [ge, 0.6, 0.26]] as const) {
      ctx2.save(); ctx2.translate(sxp, syp); ctx2.rotate(-0.3);
      const st = ctx2.createRadialGradient(0, 0, 0, 0, 0, R * size);
      st.addColorStop(0, `rgba(255,246,225,${coreA})`);
      st.addColorStop(0.45, rgba(mix(hue, "#ffffff", 0.3), coreA * 0.6));
      st.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = st;
      ctx2.beginPath(); ctx2.ellipse(0, 0, R * size, R * size * 0.57, 0, 0, TAU); ctx2.fill();
      ctx2.restore();
    }
    void rnd;
  },

  /** THE WEB — a ReAct graph wrapped around a world: glowing nodes, guarded
   *  edges, and one path brighter than the rest — the run that stayed inside
   *  its step budget. */
  "agent-graph"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    const nodes: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rnd() * 0.5, rr = R * (0.3 + rnd() * 0.5);
      nodes.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
    }
    const edges: [number, number][] = [];
    for (let i = 0; i < 8; i++) if (rnd() < 0.8) edges.push([i, (i + 1 + Math.floor(rnd() * 3)) % 8]);
    edges.forEach(([a, b], i) => {
      const bright = i === 2;
      for (const [ctx2, al, lw] of [[g, bright ? 0.5 : 0.22, 0.8], [ge, bright ? 0.45 : 0.14, 1.6]] as const) {
        ctx2.strokeStyle = rgba(mix(hue, "#ffffff", 0.5), al); ctx2.lineWidth = lw;
        ctx2.beginPath(); ctx2.moveTo(nodes[a][0], nodes[a][1]); ctx2.lineTo(nodes[b][0], nodes[b][1]); ctx2.stroke();
      }
    });
    nodes.forEach(([x, y]) => {
      g.fillStyle = "rgba(255,255,255,.7)";
      g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill();
      ge.fillStyle = rgba(mix(hue, "#ffffff", 0.6), 0.6);
      ge.beginPath(); ge.arc(x, y, 2, 0, TAU); ge.fill();
    });
  },

  /** PORTS — the eval stack exposed over MCP: hexagonal socket apertures cut
   *  into ice, rims alight, one port with its beam open. */
  "mcp-tools"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, rr = R * (0.34 + (i % 2) * 0.28);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8, s = R * 0.09;
      const hex = (ctx2: CanvasRenderingContext2D, sc: number) => {
        ctx2.beginPath();
        for (let k = 0; k <= 6; k++) {
          const aa = (k / 6) * TAU;
          const px = x + Math.cos(aa) * s * sc, py = y + Math.sin(aa) * s * sc * 0.8;
          k === 0 ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py);
        }
      };
      g.fillStyle = "rgba(4,6,14,.7)"; hex(g, 1); g.fill();
      g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 0.8; hex(g, 1); g.stroke();
      ge.strokeStyle = rgba(mix(hue, "#ffffff", 0.5), 0.4); ge.lineWidth = 1.4; hex(ge, 1.05); ge.stroke();
      if (i === 1) { // the open port: a beam leaving the surface
        const bg = ge.createLinearGradient(x, y, x + R * 0.4, y - R * 0.5);
        bg.addColorStop(0, rgba(mix(hue, "#ffffff", 0.6), 0.55)); bg.addColorStop(1, "rgba(0,0,0,0)");
        ge.fillStyle = bg;
        ge.beginPath(); ge.moveTo(x - s * 0.5, y); ge.lineTo(x + R * 0.34, y - R * 0.52);
        ge.lineTo(x + R * 0.46, y - R * 0.4); ge.lineTo(x + s * 0.5, y + s * 0.3); ge.closePath(); ge.fill();
      }
      void rnd;
    }
  },

  /** TRAFFIC BANDS — a gateway's weather: express lanes streaming around the
   *  planet, and one dark toll band where the rate limiter sits. */
  "llm-gateway"(p) {
    const { g, ge, cx, cy, R, rnd, rgba, mix, hue } = p;
    softBands(p, 11, 0.07);
    // express lanes: dashed streams on three latitudes
    [-0.45, 0.05, 0.5].forEach((latF, li) => {
      const y = cy + latF * R, sq = chord(R, latF * R);
      let x = cx - sq + rnd() * 8;
      while (x < cx + sq) {
        const w = 3 + rnd() * 7;
        for (const [ctx2, al, h] of [[g, 0.4, 1.2], [ge, 0.35, 1.8]] as const) {
          ctx2.fillStyle = rgba(mix(hue, "#ffffff", 0.55), al);
          ctx2.fillRect(x, y - h / 2 + li, Math.min(w, cx + sq - x), h);
        }
        x += w + 4 + rnd() * 6;
      }
    });
    // the toll band: flow interrupted
    const ty = cy + R * 0.27, tsq = chord(R, R * 0.27);
    g.fillStyle = "rgba(3,5,10,.6)";
    g.fillRect(cx - tsq, ty - R * 0.045, tsq * 2, R * 0.09);
  },

  /** TESSELLATE — a rules engine's surface: hex tiling, property-pinned, and
   *  one matched TRIPLE lit up mid-cascade. */
  "match3-engine"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    const s = R * 0.13;
    const lit: [number, number][] = [[0, 0], [1, 0], [1, 1]]; // the triple
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
      const x = cx + s * 1.5 * q, y = cy + s * 1.72 * (r + q / 2);
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R * 0.85) continue;
      const isLit = lit.some(([lq, lr]) => lq === q && lr === r);
      g.strokeStyle = `rgba(255,255,255,${isLit ? 0.55 : 0.16})`; g.lineWidth = isLit ? 1 : 0.6;
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const aa = (k / 6) * TAU + TAU / 12;
        const px = x + Math.cos(aa) * s, py = y + Math.sin(aa) * s;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.stroke();
      if (isLit) {
        g.fillStyle = rgba(mix(hue, "#ffffff", 0.4), 0.25); g.fill();
        ge.fillStyle = rgba(mix(hue, "#ffffff", 0.5), 0.5);
        ge.beginPath(); ge.arc(x, y, s * 0.7, 0, TAU); ge.fill();
      } else if (rnd() < 0.2) {
        g.fillStyle = "rgba(255,255,255,.05)"; g.fill();
      }
    }
  },

  /** TWIN-LANE RUNNER — one engine, two runtimes: the hemispheres carry the
   *  same lanes in two tones, and a single runner streaks down a lane with
   *  its trace glowing behind it. */
  "tapdodge-engine"(p) {
    const { g, ge, cx, cy, R, rnd, rgba, mix, hue, TAU } = p;
    // hemisphere tone split — subtle: same world, two builds
    const half = g.createLinearGradient(cx - R, cy, cx + R, cy);
    half.addColorStop(0, "rgba(255,255,255,.05)"); half.addColorStop(0.5, "rgba(255,255,255,.05)");
    half.addColorStop(0.5, "rgba(6,8,18,.14)"); half.addColorStop(1, "rgba(6,8,18,.14)");
    g.fillStyle = half; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // vertical dodge lanes
    for (let i = -3; i <= 3; i++) {
      const x = cx + (i * R) / 3.6;
      const sq = Math.sqrt(Math.max(0, 1 - ((x - cx) / R) ** 2)) * R;
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, cy - sq); g.lineTo(x, cy + sq); g.stroke();
    }
    // the runner + its trace (the trace IS the product)
    const lane = cx + R / 3.6;
    const sq2 = Math.sqrt(Math.max(0, 1 - ((lane - cx) / R) ** 2)) * R;
    const ry = cy + R * 0.1;
    const tg = ge.createLinearGradient(lane, ry, lane, Math.min(ry + R * 0.7, cy + sq2));
    tg.addColorStop(0, rgba(mix(hue, "#ffffff", 0.6), 0.75)); tg.addColorStop(1, "rgba(0,0,0,0)");
    ge.strokeStyle = tg; ge.lineWidth = 1.8;
    ge.beginPath(); ge.moveTo(lane, ry); ge.lineTo(lane, Math.min(ry + R * 0.7, cy + sq2)); ge.stroke();
    for (const ctx2 of [g, ge]) {
      ctx2.fillStyle = "rgba(255,255,255,.9)";
      ctx2.beginPath(); ctx2.arc(lane, ry, 1.8, 0, TAU); ctx2.fill();
    }
    void rnd;
  },

  /** THE TWINS' SEAM — write it twice; the disagreement names the liar. Two
   *  hemispheres textured DIFFERENTLY (dots vs dashes — same spec, different
   *  implementation), and the seam glows hardest where they disagree. */
  "evals-differential-oracle"(p) {
    const { g, ge, cx, cy, R, rnd, fbm, TAU, rgba, mix, hue } = p;
    const h2 = mix(hue, "#a78bfa", 0.45);
    const half = g.createLinearGradient(cx - R, cy, cx + R, cy);
    half.addColorStop(0, "rgba(0,0,0,0)"); half.addColorStop(0.5, "rgba(0,0,0,0)");
    half.addColorStop(0.5, rgba(h2, 0.4)); half.addColorStop(1, rgba(h2, 0.3));
    g.fillStyle = half; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // left implementation: dots · right implementation: dashes
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI - Math.PI / 2, rr = Math.sqrt(rnd()) * R * 0.9;
      const y = cy + Math.sin(a) * rr, xl = cx - Math.abs(Math.cos(a)) * rr, xr = cx + Math.abs(Math.cos(a)) * rr;
      g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.08})`;
      g.beginPath(); g.arc(xl, y, 0.8 + rnd(), 0, TAU); g.fill();
      g.fillRect(xr - 2, y, 4 + rnd() * 3, 0.9);
    }
    // the seam: brightness varies with local disagreement
    for (const [ctx2, base, lw] of [[g, 0.5, 1.2], [ge, 0.5, 2.4]] as const) {
      for (let y = -R; y < R; y += R / 10) {
        const wob = (fbm(4.5, (y / R) * 3 + 9) - 0.5);
        const x = cx + wob * R * 0.22;
        const disagreement = Math.abs(wob) * 2;
        ctx2.strokeStyle = `rgba(255,255,255,${base * (0.4 + disagreement)})`;
        ctx2.lineWidth = lw;
        ctx2.beginPath(); ctx2.moveTo(x, cy + y); ctx2.lineTo(cx + (fbm(4.5, ((y + R / 10) / R) * 3 + 9) - 0.5) * R * 0.22, cy + y + R / 10);
        ctx2.stroke();
      }
    }
  },

  /** THE REEL — record once, fan out everywhere: an equatorial film strip,
   *  sprocket holes and all, with exactly one frame lit — the playhead. */
  "cast-pipeline"(p) {
    const { g, ge, cx, cy, R, rnd, TAU, rgba, mix, hue } = p;
    // gentle ocean swell beneath
    for (let i = 0; i < 5; i++) {
      const y = cy - R + rnd() * 2 * R, sw = R * (0.5 + rnd() * 0.7);
      const lg = g.createLinearGradient(cx - sw, y, cx + sw, y);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, `rgba(255,255,255,${0.06 + rnd() * 0.05})`);
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.beginPath(); g.ellipse(cx, y, sw, R * 0.05, 0, 0, TAU); g.fill();
    }
    // the strip
    const bandH = R * 0.22, sq = chord(R, 0);
    g.fillStyle = "rgba(4,5,12,.78)";
    g.fillRect(cx - sq, cy - bandH / 2, sq * 2, bandH);
    // frames + sprockets
    const frameW = R * 0.16;
    let i = 0;
    for (let x = cx - sq; x < cx + sq; x += frameW, i++) {
      g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 0.7;
      g.strokeRect(x + 1.5, cy - bandH * 0.28, frameW - 3, bandH * 0.56);
      [-1, 1].forEach((s) => {
        g.fillStyle = "rgba(255,255,255,.45)";
        g.fillRect(x + frameW * 0.35, cy + s * bandH * 0.4 - 1, 2, 2);
      });
      if (i === 3) { // the playhead frame
        g.fillStyle = rgba(mix(hue, "#ffffff", 0.5), 0.5);
        g.fillRect(x + 1.5, cy - bandH * 0.28, frameW - 3, bandH * 0.56);
        ge.fillStyle = rgba(mix(hue, "#ffffff", 0.55), 0.7);
        ge.fillRect(x + 1, cy - bandH * 0.32, frameW - 2, bandH * 0.64);
      }
    }
  },
};
