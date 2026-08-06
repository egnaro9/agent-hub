/* ════════════════════════════════════════════════════════════════════════════
   EIGHTEEN WORLDS, EIGHTEEN SURFACES — REBUILT, THEN PUT THROUGH CRITIQUE.

   Every project's planet is individualized the way its overview world and its
   card are: the surface program is derived from what the project actually IS.
   The bake in GalaxyCanvas owns the physics — base sphere, crescent light,
   clip, axial tilt, RELIGHT pass, terminator, limb — a painter only writes
   the surface (g) and the features that should BLOOM (ge). Both contexts
   arrive pre-clipped and pre-tilted; the bake supersamples 2×, so hairlines
   hold at arrival zoom.

   Craft rules paid for in review: the signature must span a THIRD of the
   disc or more — smaller reads as a sticker on a ball. Detail follows the
   sphere through the orthographic kit (bands curve, grids foreshorten,
   marks squash at the limb). The hero feature is the brightest thing on the
   disc, and there is exactly one hero per world.
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
  /** Rotation about the world's own axis, in radians. Every painter works in
      latitude/longitude through the sphere kit, so a turning world is this
      one number — not a second art pass. */
  phase: number;
}

type Painter = (p: PaintCtx) => void;
type Ctx = CanvasRenderingContext2D;

/* ── the sphere kit ────────────────────────────────────────────────────────
   Orthographic projection with an axial pitch β toward the viewer. pt() maps
   (lon, lat) to screen + a facing term z (z>0 is the near hemisphere).     */

interface Sphere {
  pt: (lon: number, lat: number) => { x: number; y: number; z: number };
  limbLon: (lat: number) => number;
  /** SURFACE longitude at the left limb for this latitude. A loop that sweeps
      the visible span must start here, not at -limbLon: pt() adds the rotation
      phase, so a fixed start would swing the drawn arc across the disc like a
      wiper instead of turning the world under it. */
  lon0: (lat: number) => number;
  latLine: (g: Ctx, lat: number, drift?: (lon: number) => number) => void;
  meridian: (g: Ctx, lon: number, lat0?: number, lat1?: number) => void;
  band: (g: Ctx, lat1: number, lat2: number, drift?: (lon: number) => number) => void;
  cell: (g: Ctx, lon0: number, lon1: number, lat0: number, lat1: number) => boolean;
  spot: (g: Ctx, lon: number, lat: number, fn: (g: Ctx, facing: number) => void) => boolean;
  cap: (g: Ctx, lat: number) => void;
}

const sphere = (p: PaintCtx, beta = 0.42): Sphere => {
  const { cx, cy, R, TAU } = p;
  const sb = Math.sin(beta), cb = Math.cos(beta);
  // Rotation lives HERE: pt is the one door every helper (latLine, meridian,
  // band, cell, spot) goes through, so offsetting longitude once turns the
  // whole surface — bands, grids, cities, seams and all.
  const ph = p.phase;
  const pt = (lonRaw: number, lat: number) => {
    const lon = lonRaw + ph;
    const X = Math.cos(lat) * Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat) * Math.cos(lon);
    return { x: cx + R * X, y: cy - R * (Y * cb - Z * sb), z: Y * sb + Z * cb };
  };
  const limbLon = (lat: number) =>
    Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(beta))));
  const lon0 = (lat: number) => -limbLon(lat) - ph;
  const latLine = (g: Ctx, lat: number, drift?: (lon: number) => number) => {
    const le = limbLon(lat);
    if (le < 0.05) return;
    for (let i = 0; i <= 48; i++) {
      const lon = lon0(lat) + (i / 48) * 2 * le;
      const q = pt(lon, lat + (drift ? drift(lon) : 0));
      if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
    }
  };
  const meridian = (g: Ctx, lon: number, lat0 = -1.42, lat1 = 1.42) => {
    let started = false;
    for (let i = 0; i <= 44; i++) {
      const lat = lat0 + (i / 44) * (lat1 - lat0);
      const q = pt(lon, lat);
      if (q.z <= 0.02) { started = false; continue; }
      if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
    }
  };
  const band = (g: Ctx, lat1: number, lat2: number, drift?: (lon: number) => number) => {
    g.beginPath();
    const le1 = limbLon(lat1), le2 = limbLon(lat2);
    for (let i = 0; i <= 40; i++) {
      const lon = lon0(lat1) + (i / 40) * 2 * le1;
      const q = pt(lon, lat1 + (drift ? drift(lon) : 0));
      if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
    }
    for (let i = 40; i >= 0; i--) {
      const lon = lon0(lat2) + (i / 40) * 2 * le2;
      const q = pt(lon, lat2 + (drift ? drift(lon + 9.3) : 0));
      g.lineTo(q.x, q.y);
    }
    g.closePath();
  };
  const cell = (g: Ctx, lon0: number, lon1: number, lat0: number, lat1: number) => {
    const mid = pt((lon0 + lon1) / 2, (lat0 + lat1) / 2);
    if (mid.z <= 0.05) return false;
    g.beginPath();
    for (let i = 0; i <= 6; i++) { const q = pt(lon0 + ((lon1 - lon0) * i) / 6, lat0); if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); }
    for (let i = 1; i <= 3; i++) { const q = pt(lon1, lat0 + ((lat1 - lat0) * i) / 3); g.lineTo(q.x, q.y); }
    for (let i = 5; i >= 0; i--) { const q = pt(lon0 + ((lon1 - lon0) * i) / 6, lat1); g.lineTo(q.x, q.y); }
    for (let i = 2; i >= 1; i--) { const q = pt(lon0, lat0 + ((lat1 - lat0) * i) / 3); g.lineTo(q.x, q.y); }
    g.closePath();
    return true;
  };
  const spot = (g: Ctx, lon: number, lat: number, fn: (g: Ctx, facing: number) => void) => {
    const q = pt(lon, lat);
    if (q.z <= 0.05) return false;
    g.save();
    g.translate(q.x, q.y);
    const a = Math.atan2(q.y - cy, q.x - cx);
    g.rotate(a);
    g.scale(Math.max(0.28, q.z), 1);
    g.rotate(-a);
    fn(g, q.z);
    g.restore();
    return true;
  };
  const cap = (g: Ctx, lat: number) => {
    const s = Math.sin(lat), c2 = Math.cos(lat);
    g.beginPath();
    g.ellipse(cx, cy - R * s * cb, R * c2, Math.max(0.6, R * c2 * sb), 0, 0, TAU);
  };
  return { pt, limbLon, lon0, latLine, meridian, band, cell, spot, cap };
};

/** Micro-speckle finisher — grain concentrated mid-disc. */
const dust = (p: PaintCtx, n: number, bright: string, dark: string) => {
  const { g, cx, cy, R, rnd, TAU } = p;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.96;
    g.fillStyle = rnd() < 0.5 ? bright : dark;
    g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.3 + rnd() * 0.8, 0, TAU); g.fill();
  }
};

/** Low-contrast terrain mottle so ground between features is never bare. */
const mottle = (p: PaintCtx, s: Sphere, n: number, light: string, dark: string, a0: number) => {
  const { rnd, TAU, R } = p;
  for (let i = 0; i < n; i++) {
    s.spot(p.g, (rnd() - 0.5) * 2.6, (rnd() - 0.5) * 2.2, (gg) => {
      const rr = R * (0.05 + rnd() * 0.09);
      const m = gg.createRadialGradient(0, 0, 0, 0, 0, rr);
      m.addColorStop(0, rnd() < 0.5 ? light : dark); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.globalAlpha = a0;
      gg.fillStyle = m; gg.beginPath(); gg.arc(0, 0, rr, 0, TAU); gg.fill();
      gg.globalAlpha = 1;
    });
  }
};

/* ═══ the eighteen ════════════════════════════════════════════════════════ */

export const PAINTERS: Record<string, Painter> = {

  /* gradecore — THE AUDITOR. A champagne-gold banded giant carrying a
     machined record ring: barcode grooves in three weights, tick-marked
     edges, and a bright scribe head still cutting. */
  gradecore: (p) => {
    const { g, ge, cx, cy, rnd, fbm, rgba, R, TAU } = p;
    const s = sphere(p, 0.38);
    // gold albedo asserts over the store hue — THE AUDITOR wears champagne
    g.fillStyle = "rgba(216,186,128,.62)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    for (let i = 0; i < 11; i++) {
      const lat = -1.25 + (i / 10) * 2.5, w = 0.09 + rnd() * 0.1;
      const dr = (lon: number) => (fbm(lon * 1.1 + i * 3.1, lat * 5) - 0.5) * 0.1;
      g.fillStyle = i % 2 ? `rgba(246,224,168,${0.22 + rnd() * 0.1})` : `rgba(76,54,22,${0.26 + rnd() * 0.12})`;
      s.band(g, lat, lat + w, dr); g.fill();
    }
    g.fillStyle = "rgba(248,238,210,.18)"; s.cap(g, 1.05); g.fill();
    // the record ring — dark lacquer, 0.34R tall
    g.fillStyle = "rgba(20,14,6,.5)"; s.band(g, -0.2, 0.18); g.fill();
    // grooves with true barcode gaps (segments, never point-teleports)
    for (let i = 0; i < 13; i++) {
      const lat = -0.165 + (i / 12) * 0.31;
      const gapC = (rnd() * 2 - 1) * 0.9, gapW = 0.12 + rnd() * 0.16;
      const wgt = rnd();
      g.strokeStyle = `rgba(246,226,168,${0.3 + rnd() * 0.3})`;
      g.lineWidth = wgt < 0.2 ? 1.8 : wgt < 0.55 ? 1 : 0.55;
      const le = s.limbLon(lat);
      g.beginPath();
      let started = false;
      for (let k = 0; k <= 60; k++) {
        const lon = s.lon0(lat) + (k / 60) * 2 * le;
        if (Math.abs(lon - gapC) < gapW) { started = false; continue; }
        const q = s.pt(lon, lat);
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke();
      if (i % 3 === 0) {
        ge.strokeStyle = rgba("#ffd97a", 0.16); ge.lineWidth = 0.8;
        ge.beginPath(); s.latLine(ge, lat); ge.stroke();
      }
    }
    // tick marks along both ring edges — the calibration
    for (const edge of [-0.2, 0.18]) {
      for (let k = -9; k <= 9; k++) {
        g.strokeStyle = "rgba(248,234,196,.5)"; g.lineWidth = 0.7;
        g.beginPath(); s.meridian(g, k * 0.18, edge - 0.028, edge + 0.028); g.stroke();
      }
    }
    // the scribe head — seated ON the ring, warm bloom, trailing highlight
    g.strokeStyle = "rgba(255,240,200,.7)"; g.lineWidth = 1.6;
    g.beginPath();
    {
      let started = false;
      for (let k = 0; k <= 24; k++) {
        const lon = 0.25 + (k / 24) * 0.47;
        const q = s.pt(lon, 0.0);
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
    }
    g.stroke();
    s.spot(g, 0.72, 0.0, (gg) => {
      gg.fillStyle = "rgba(255,246,218,.98)";
      gg.beginPath(); gg.arc(0, 0, R * 0.055, 0, TAU); gg.fill();
      gg.strokeStyle = "rgba(255,246,218,.6)"; gg.lineWidth = 1;
      gg.beginPath(); gg.moveTo(0, -R * 0.12); gg.lineTo(0, R * 0.12); gg.stroke();
    });
    s.spot(ge, 0.72, 0.0, (gg) => {
      const m = gg.createRadialGradient(0, 0, 0, 0, 0, R * 0.15);
      m.addColorStop(0, "rgba(255,233,176,.95)"); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = m; gg.beginPath(); gg.arc(0, 0, R * 0.15, 0, TAU); gg.fill();
    });
    dust(p, 110, "rgba(255,246,220,.06)", "rgba(30,20,8,.08)");
  },

  /* crashkit — THE STRESS-FRACTURED WORLD. Near-black obsidian plates with
     glassy sheen, a dense magma web routed along their boundaries, and one
     impact wound ringed by shockwaves. */
  crashkit: (p) => {
    const { g, ge, cx, cy, R, rnd, rgba, mix, hue, TAU } = p;
    const s = sphere(p, 0.46);
    g.fillStyle = "rgba(7,6,11,.8)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // obsidian plates: polygonal, edge-lit, with a glassy sheen lobe
    const plates: { lon: number; lat: number }[] = [];
    for (let i = 0; i < 11; i++) plates.push({ lon: (rnd() - 0.5) * 2.6, lat: (rnd() - 0.5) * 2.2 });
    plates.forEach((pl) => {
      s.spot(g, pl.lon, pl.lat, (gg) => {
        const rr = R * (0.16 + rnd() * 0.14);
        gg.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * TAU + 0.3, r2 = rr * (0.7 + rnd() * 0.5);
          if (k === 0) gg.moveTo(Math.cos(a) * r2, Math.sin(a) * r2); else gg.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        }
        gg.closePath();
        gg.fillStyle = `rgba(${16 + Math.floor(rnd() * 14)},${12 + Math.floor(rnd() * 10)},${24 + Math.floor(rnd() * 12)},.65)`;
        gg.fill();
        gg.strokeStyle = "rgba(140,105,95,.3)"; gg.lineWidth = 0.6; gg.stroke();
        const sheen = gg.createLinearGradient(-rr, -rr, rr * 0.4, rr * 0.4);
        sheen.addColorStop(0, "rgba(180,160,175,.12)"); sheen.addColorStop(0.5, "rgba(0,0,0,0)");
        gg.fillStyle = sheen; gg.fill();
      });
    });
    // the magma web — routed between plate centers, glow underlay + hot core
    const vein = (aP: { lon: number; lat: number }, bP: { lon: number; lat: number }, w: number) => {
      const steps = 10;
      let prev = s.pt(aP.lon, aP.lat);
      for (let k = 1; k <= steps; k++) {
        const u = k / steps;
        const lon = aP.lon + (bP.lon - aP.lon) * u + (rnd() - 0.5) * 0.09;
        const lat = aP.lat + (bP.lat - aP.lat) * u + (rnd() - 0.5) * 0.09;
        const q = s.pt(lon, lat);
        if (prev.z > 0.03 && q.z > 0.03) {
          const heat = 130 + Math.floor(rnd() * 70);
          g.strokeStyle = `rgba(255,${heat},70,.16)`; g.lineWidth = w * 3; g.lineCap = "round";
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); g.stroke();
          g.strokeStyle = `rgba(255,${heat + 30},90,${0.6 + rnd() * 0.35})`; g.lineWidth = w * (0.6 + prev.z * 0.6);
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); g.stroke();
          ge.strokeStyle = `rgba(255,${heat + 20},90,${0.45 + rnd() * 0.3})`;
          ge.lineWidth = w * 1.5 * prev.z; ge.lineCap = "round";
          ge.beginPath(); ge.moveTo(prev.x, prev.y); ge.lineTo(q.x, q.y); ge.stroke();
        }
        prev = q;
      }
    };
    // connect each plate to its 2 nearest neighbours — boundaries carry the heat
    plates.forEach((a2, i) => {
      const near = plates
        .map((b2, j) => ({ j, d: (a2.lon - b2.lon) ** 2 + (a2.lat - b2.lat) ** 2 }))
        .filter((x) => x.j !== i).sort((x, y2) => x.d - y2.d).slice(0, 2);
      near.forEach((n2) => { if (n2.j > i) vein(a2, plates[n2.j], 1.7); });
    });
    // capillaries
    for (let i = 0; i < 7; i++) {
      const a2 = plates[Math.floor(rnd() * plates.length)];
      vein(a2, { lon: a2.lon + (rnd() - 0.5) * 0.7, lat: a2.lat + (rnd() - 0.5) * 0.7 }, 0.8);
    }
    // THE IMPACT — wound, shock rings out to 0.36R, fractures joining the web
    const IMP = { lon: -0.55, lat: 0.32 };
    s.spot(g, IMP.lon, IMP.lat, (gg, f) => {
      for (let r2 = 1; r2 <= 3; r2++) {
        gg.strokeStyle = `rgba(255,180,120,${0.4 / r2})`; gg.lineWidth = 1.6 - r2 * 0.3;
        gg.beginPath(); gg.arc(0, 0, R * 0.12 * r2, 0, TAU); gg.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + rnd() * 0.4, len = R * (0.2 + rnd() * 0.16) * (0.5 + f);
        gg.strokeStyle = `rgba(255,${150 + Math.floor(rnd() * 60)},90,${0.6 + rnd() * 0.3})`;
        gg.lineWidth = 1.6 - (i % 3) * 0.4;
        gg.beginPath(); gg.moveTo(Math.cos(a) * R * 0.03, Math.sin(a) * R * 0.03);
        gg.lineTo(Math.cos(a + 0.2) * len, Math.sin(a + 0.2) * len); gg.stroke();
      }
      gg.fillStyle = "rgba(255,222,160,.98)";
      gg.beginPath(); gg.arc(0, 0, R * 0.05, 0, TAU); gg.fill();
    });
    s.spot(ge, IMP.lon, IMP.lat, (gg) => {
      const m = gg.createRadialGradient(0, 0, 0, 0, 0, R * 0.17);
      m.addColorStop(0, "rgba(255,228,175,.98)"); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = m; gg.beginPath(); gg.arc(0, 0, R * 0.17, 0, TAU); gg.fill();
    });
    for (let i = 0; i < 3; i++) vein(IMP, plates[Math.floor(rnd() * plates.length)], 1.1);
    // ember pools
    for (let i = 0; i < 5; i++) {
      s.spot(ge, (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 1.8, (gg) => {
        gg.fillStyle = rgba(mix(hue, "#ff9a5a", 0.6), 0.6);
        gg.beginPath(); gg.arc(0, 0, R * (0.022 + rnd() * 0.025), 0, TAU); gg.fill();
      });
    }
    dust(p, 90, "rgba(255,170,120,.06)", "rgba(0,0,0,.18)");
  },

  /* model-drift — THE SHEARED WORLD. High-contrast survey bands that SLIP at
     the fault — alternating directions band to band — pinned by bright
     staples, with a probe line pacing the full disc. */
  "model-drift": (p) => {
    const { g, ge, rnd, fbm, rgba, mix, hue } = p;
    const s = sphere(p, 0.4);
    const F = 0.18;
    const bandShift = (i: number) => (i % 2 ? 0.07 : -0.07);
    for (let i = 0; i < 12; i++) {
      const lat = -1.2 + (i / 11) * 2.4, w = 0.11 + rnd() * 0.06;
      const shift = bandShift(i);
      const dr = (lon: number) => (lon > F ? shift : 0) + (fbm(lon * 0.9 + i * 2.7, lat * 4) - 0.5) * 0.03;
      g.fillStyle = i % 2
        ? `rgba(240,226,196,${0.24 + rnd() * 0.08})`
        : `rgba(18,26,44,${0.3 + rnd() * 0.08})`;
      s.band(g, lat, lat + w, dr); g.fill();
    }
    // discontinuity: a dark shadow gap, then the pale fault seam
    g.strokeStyle = "rgba(6,8,14,.75)"; g.lineWidth = 2;
    g.beginPath(); s.meridian(g, F - 0.02, -1.3, 1.3); g.stroke();
    g.strokeStyle = "rgba(240,244,252,.7)"; g.lineWidth = 1;
    g.beginPath(); s.meridian(g, F, -1.3, 1.3); g.stroke();
    ge.strokeStyle = rgba(mix(hue, "#bcd2ff", 0.6), 0.35); ge.lineWidth = 1.6;
    ge.beginPath(); s.meridian(ge, F, -1.2, 1.2); ge.stroke();
    // near-white measurement staples pinning each visible offset
    for (const [lat, bi] of [[-0.85, 1], [-0.5, 3], [-0.15, 5], [0.2, 7], [0.55, 8], [0.9, 10]] as const) {
      const shift = bandShift(bi);
      const a = s.pt(F - 0.12, lat), b = s.pt(F + 0.12, lat + shift);
      if (a.z > 0.05 && b.z > 0.05) {
        g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        g.moveTo(a.x, a.y - 2.6); g.lineTo(a.x, a.y + 2.6);
        g.moveTo(b.x, b.y - 2.6); g.lineTo(b.x, b.y + 2.6); g.stroke();
      }
    }
    // the probe survey — full-width, two specks flaring
    g.strokeStyle = "rgba(255,255,255,.2)"; g.lineWidth = 0.6;
    g.beginPath(); s.latLine(g, 0.94); g.stroke();
    for (let i = 0; i < 9; i++) {
      const le = s.limbLon(0.94);
      const lon = s.lon0(0.94) + le * 0.08 + (i / 8) * 2 * le * 0.92;
      s.spot(g, lon, 0.94, (gg) => {
        gg.fillStyle = "rgba(255,255,255,.9)";
        gg.beginPath(); gg.arc(0, 0, 1.2, 0, p.TAU); gg.fill();
      });
      if (i === 2 || i === 6) s.spot(ge, lon, 0.94, (gg) => {
        gg.fillStyle = "rgba(225,238,255,.85)";
        gg.beginPath(); gg.arc(0, 0, 1.9, 0, p.TAU); gg.fill();
      });
    }
    dust(p, 80, "rgba(240,244,255,.05)", "rgba(8,10,18,.08)");
  },

  /* rag-eval-lab — THE LIBRARY SEA. A deep blue ocean; four island chains
     wired into a citation graph across two-thirds of the disc; a lighthouse
     sweeping a real beam over the water. */
  "rag-eval-lab": (p) => {
    const { g, ge, cx, cy, rnd, fbm, rgba, mix, hue, TAU, R } = p;
    const s = sphere(p, 0.44);
    // deep water first — the sea must read before anything sits on it
    g.fillStyle = "rgba(8,30,58,.6)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    for (let i = 0; i < 8; i++) {
      const lat = -1.15 + (i / 7) * 2.3;
      g.strokeStyle = `rgba(160,215,240,${0.08 + rnd() * 0.06})`; g.lineWidth = 1.4 + rnd() * 1.8;
      g.beginPath(); s.latLine(g, lat, (lon) => (fbm(lon * 1.3 + i * 4.1, lat * 3) - 0.5) * 0.2); g.stroke();
    }
    // four chains spanning the disc, upper-left included
    const isles: { lon: number; lat: number }[] = [];
    const starts: [number, number][] = [[-1.15, 0.75], [-0.6, 0.05], [0.05, -0.55], [0.55, 0.55]];
    starts.forEach(([lon0, lat0]) => {
      let lon = lon0 + rnd() * 0.15, lat = lat0 + rnd() * 0.15;
      let prev: { lon: number; lat: number } | null = null;
      for (let i = 0; i < 4; i++) {
        const here = { lon, lat };
        isles.push(here);
        s.spot(g, lon, lat, (gg) => {
          const sh = gg.createRadialGradient(0, 0, 0, 0, 0, R * 0.12);
          sh.addColorStop(0, rgba(mix(hue, "#7fe8d0", 0.65), 0.55)); sh.addColorStop(1, "rgba(0,0,0,0)");
          gg.fillStyle = sh; gg.beginPath(); gg.arc(0, 0, R * 0.12, 0, TAU); gg.fill();
          gg.fillStyle = `rgba(${216 + Math.floor(rnd() * 25)},${196 + Math.floor(rnd() * 25)},152,.95)`;
          gg.beginPath();
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * TAU, rr = R * (0.032 + rnd() * 0.022);
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.8;
            if (k === 0) gg.moveTo(px, py); else gg.lineTo(px, py);
          }
          gg.closePath(); gg.fill();
          gg.fillStyle = "rgba(56,112,66,.8)";
          gg.beginPath(); gg.arc(rnd() * 2.4 - 1.2, rnd() * 2.4 - 1.2, R * 0.016, 0, TAU); gg.fill();
        });
        if (prev) {
          const a = s.pt(prev.lon, prev.lat), b = s.pt(lon, lat);
          if (a.z > 0.05 && b.z > 0.05) {
            g.strokeStyle = rgba(mix(hue, "#d2f7ec", 0.75), 0.6); g.lineWidth = 1;
            g.setLineDash([2.6, 2.8]);
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
            g.setLineDash([]);
          }
        }
        prev = here;
        lon += 0.24 + rnd() * 0.16; lat -= 0.12 + rnd() * 0.16;
      }
    });
    // two cross-chain citations — retrieval reaching across the sea
    for (const [i1, i2] of [[0, 9], [4, 14]] as const) {
      if (isles.length <= Math.max(i1, i2)) continue;
      const a = s.pt(isles[i1].lon, isles[i1].lat), b = s.pt(isles[i2].lon, isles[i2].lat);
      if (a.z > 0.05 && b.z > 0.05) {
        g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 0.8; g.setLineDash([1.6, 3.6]);
        g.beginPath(); g.moveTo(a.x, a.y);
        g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - R * 0.14, b.x, b.y); g.stroke();
        g.setLineDash([]);
      }
    }
    // the lighthouse — off the limb, with a real sweeping beam
    const LH = { lon: 0.5, lat: -0.32 };
    s.spot(g, LH.lon, LH.lat, (gg) => {
      gg.fillStyle = "rgba(255,252,238,.98)";
      gg.beginPath(); gg.arc(0, 0, R * 0.03, 0, TAU); gg.fill();
      const beam = gg.createLinearGradient(0, 0, R * 0.42, R * 0.1);
      beam.addColorStop(0, "rgba(255,248,215,.5)"); beam.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = beam;
      gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(R * 0.44, -R * 0.02); gg.lineTo(R * 0.4, R * 0.15); gg.closePath(); gg.fill();
    });
    s.spot(ge, LH.lon, LH.lat, (gg) => {
      gg.fillStyle = "rgba(255,248,220,.95)";
      gg.beginPath(); gg.arc(0, 0, R * 0.032, 0, TAU); gg.fill();
      const beam = gg.createLinearGradient(0, 0, R * 0.4, R * 0.09);
      beam.addColorStop(0, "rgba(255,246,200,.6)"); beam.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = beam;
      gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(R * 0.4, -R * 0.015); gg.lineTo(R * 0.36, R * 0.13); gg.closePath(); gg.fill();
    });
    dust(p, 70, "rgba(235,250,255,.06)", "rgba(4,10,16,.07)");
  },

  /* eval-history — THE STRATIFIED WORLD. Deep bedding, a real angular
     unconformity, a rift canyon with a lit rim, fossils you can see, one
     amber seam still glowing. */
  "eval-history": (p) => {
    const { g, ge, rnd, fbm, rgba, R, TAU } = p;
    const s = sphere(p, 0.36);
    const tones = ["rgba(214,183,140,1)", "rgba(122,90,72,1)", "rgba(58,63,82,1)", "rgba(176,138,106,1)"];
    for (let i = 0; i < 22; i++) {
      const lat = -1.3 + (i / 21) * 2.6, w = 0.07 + rnd() * 0.05;
      const dr = (lon: number) => (fbm(lon * 0.8 + i * 1.9, lat * 6) - 0.5) * 0.03;
      g.fillStyle = tones[i % tones.length].replace(",1)", `,${0.16 + rnd() * 0.1})`);
      s.band(g, lat, lat + w, dr); g.fill();
      if (rnd() < 0.3) {
        g.strokeStyle = "rgba(20,14,10,.2)"; g.lineWidth = 0.4;
        g.beginPath(); s.latLine(g, lat, dr); g.stroke();
      }
    }
    // the unconformity: an older sequence tilted hard against the bedding
    g.save();
    g.beginPath(); s.band(g, -1.3, -0.42); g.clip();
    g.translate(p.cx, p.cy); g.rotate(0.42); g.translate(-p.cx, -p.cy);
    for (let i = 0; i < 9; i++) {
      const lat = -1.3 + (i / 8) * 1.3;
      g.fillStyle = tones[(i + 2) % tones.length].replace(",1)", ",.32)");
      s.band(g, lat, lat + 0.09); g.fill();
    }
    g.restore();
    // crisp truncation line where young beds cut the old
    g.strokeStyle = "rgba(244,232,212,.65)"; g.lineWidth = 1.3;
    g.beginPath(); s.latLine(g, -0.42, (lon) => (fbm(lon * 2.2, 3.3) - 0.5) * 0.04); g.stroke();
    // the rift canyon: wide dark floor, lit rim
    g.strokeStyle = "rgba(8,6,8,.85)"; g.lineWidth = 4.6;
    g.beginPath(); s.meridian(g, -0.5, -1.1, 0.9); g.stroke();
    g.strokeStyle = "rgba(24,16,14,.9)"; g.lineWidth = 2.2;
    g.beginPath(); s.meridian(g, -0.5, -1.05, 0.85); g.stroke();
    g.strokeStyle = "rgba(255,238,208,.55)"; g.lineWidth = 1;
    g.beginPath(); s.meridian(g, -0.565, -1.05, 0.85); g.stroke();
    // fossils — three chalky spirals, sized to read
    for (let i = 0; i < 3; i++) {
      s.spot(g, 0.3 + i * 0.4, 0.52, (gg) => {
        gg.strokeStyle = "rgba(246,238,220,.75)"; gg.lineWidth = 1.1;
        gg.beginPath();
        for (let a = 0; a < TAU * 1.9; a += 0.25) {
          const rr = R * 0.0105 * a;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (a === 0) gg.moveTo(px, py); else gg.lineTo(px, py);
        }
        gg.stroke();
      });
    }
    // the amber seam
    ge.strokeStyle = rgba("#ffc46b", 0.45); ge.lineWidth = 1.3;
    ge.beginPath(); s.latLine(ge, 0.18, (lon) => (fbm(lon * 1.4, 7.7) - 0.5) * 0.03); ge.stroke();
    g.strokeStyle = rgba("#ffc46b", 0.6); g.lineWidth = 0.9;
    g.beginPath(); s.latLine(g, 0.18, (lon) => (fbm(lon * 1.4, 7.7) - 0.5) * 0.03); g.stroke();
    dust(p, 100, "rgba(240,225,200,.05)", "rgba(15,10,8,.09)");
  },

  /* eval-dashboard — THE FACETED GEM. Card-tiles in distinct tints, one LIVE
     tile burning brightest with bloom spilling onto its neighbours, aurora
     curtains over the pole. */
  "eval-dashboard": (p) => {
    const { g, ge, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.45);
    const ROWS = 7;
    let live: { lon0: number; lon1: number; lat0: number; lat1: number } | null = null;
    for (let r = 0; r < ROWS; r++) {
      const lat0 = -1.25 + (r / ROWS) * 2.5, lat1 = lat0 + 2.5 / ROWS;
      const cols = 4 + Math.round(4 * Math.cos((lat0 + lat1) / 2));
      for (let c2 = 0; c2 < cols; c2++) {
        const lon0 = -Math.PI / 2 + (c2 / cols) * Math.PI, lon1 = lon0 + Math.PI / cols;
        const tone = (r * 3 + c2 * 5 + Math.floor(rnd() * 2)) % 5;
        g.fillStyle = [
          rgba(mix(hue, "#ffffff", 0.5), 0.3),
          rgba(mix(hue, "#0a1428", 0.55), 0.4),
          rgba(mix(hue, "#ffc678", 0.45), 0.2),
          rgba(mix(hue, "#8ff5ff", 0.5), 0.22),
          rgba(mix(hue, "#b39dff", 0.4), 0.18),
        ][tone];
        if (s.cell(g, lon0, lon1, lat0, lat1)) {
          g.fill();
          g.strokeStyle = "rgba(240,252,255,.24)"; g.lineWidth = 0.55; g.stroke();
          if (!live && r === 3 && c2 === Math.floor(cols / 2)) live = { lon0, lon1, lat0, lat1 };
        }
      }
    }
    // THE LIVE TILE — hottest thing on the disc, bloom spilling past its edges
    if (live) {
      g.fillStyle = rgba(mix(hue, "#8dfff0", 0.75), 0.9);
      s.cell(g, live.lon0, live.lon1, live.lat0, live.lat1); g.fill();
      g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 1.1; g.stroke();
      ge.fillStyle = rgba(mix(hue, "#aefcec", 0.8), 0.9);
      s.cell(ge, live.lon0, live.lon1, live.lat0, live.lat1); ge.fill();
      const mid = s.pt((live.lon0 + live.lon1) / 2, (live.lat0 + live.lat1) / 2);
      const bloom = ge.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, R * 0.2);
      bloom.addColorStop(0, rgba(mix(hue, "#c9fff5", 0.8), 0.6)); bloom.addColorStop(1, "rgba(0,0,0,0)");
      ge.fillStyle = bloom; ge.beginPath(); ge.arc(mid.x, mid.y, R * 0.2, 0, TAU); ge.fill();
    }
    // gem glints on facet corners of the lit side
    for (let i = 0; i < 3; i++) {
      s.spot(g, -0.9 + i * 0.35, 0.55 - i * 0.4, (gg) => {
        gg.strokeStyle = "rgba(255,255,255,.9)"; gg.lineWidth = 0.8;
        gg.beginPath(); gg.moveTo(-2.6, 0); gg.lineTo(2.6, 0); gg.moveTo(0, -2.6); gg.lineTo(0, 2.6); gg.stroke();
      });
    }
    // aurora curtains
    for (let i = 0; i < 4; i++) {
      const lat = 0.9 + i * 0.09;
      ge.strokeStyle = rgba(mix("#54ffd2", hue, 0.2), 0.42 - i * 0.07); ge.lineWidth = 3.2 - i * 0.5;
      ge.beginPath(); s.latLine(ge, lat, (lon) => Math.sin(lon * 5 + i * 2) * 0.05); ge.stroke();
      g.strokeStyle = rgba(mix("#54ffd2", hue, 0.2), 0.3 - i * 0.05); g.lineWidth = 2 - i * 0.3;
      g.beginPath(); s.latLine(g, lat, (lon) => Math.sin(lon * 5 + i * 2) * 0.05); g.stroke();
    }
    dust(p, 60, "rgba(240,255,255,.06)", "rgba(6,12,20,.08)");
  },

  /* prompt-regress — THE WALLED WORLD. Ramparts spanning three quarters of
     the disc, beacons sparking at the gates — and ONE breach blown through
     the rings, debris streaking outward. */
  "prompt-regress": (p) => {
    const { g, ge, rnd, R, TAU, LIGHT } = p;
    const s = sphere(p, 0.4);
    mottle(p, s, 12, "rgba(52,48,58,1)", "rgba(20,18,26,1)", 0.35);
    const la = Math.atan2(LIGHT.y, LIGHT.x);
    const CIT = { lon: -0.15, lat: 0.08 };
    const gateAt = [0.7, 2.4, 4.4];
    // rings span ~0.85 of the disc
    s.spot(g, CIT.lon, CIT.lat, (gg, f) => {
      for (let ring = 3; ring >= 1; ring--) {
        const rr = R * 0.155 * ring * (0.6 + f * 0.55);
        for (let seg = 0; seg < 26; seg++) {
          const a0 = (seg / 26) * TAU, a1 = a0 + TAU / 26 - 0.04;
          const nearGate = gateAt.some((ga) => Math.abs(((a0 - ga + Math.PI) % TAU) - Math.PI) < 0.14);
          if (nearGate) continue;
          gg.strokeStyle = "rgba(10,8,12,.8)"; gg.lineWidth = 3.4;
          gg.beginPath(); gg.arc(0, 0, rr, a0, a1); gg.stroke();
          gg.strokeStyle = "rgba(232,220,196,.65)"; gg.lineWidth = 1.2;
          gg.beginPath(); gg.arc(0, 0, rr - 1.2, a0 + (Math.cos(a0 - la) > 0 ? 0 : 0.02), a1); gg.stroke();
        }
        for (let t2 = 0; t2 < 52; t2++) {
          const a = (t2 / 52) * TAU;
          if (gateAt.some((ga) => Math.abs(((a - ga + Math.PI) % TAU) - Math.PI) < 0.14)) continue;
          gg.strokeStyle = "rgba(232,220,196,.4)"; gg.lineWidth = 0.6;
          gg.beginPath(); gg.moveTo(Math.cos(a) * (rr - 2.2), Math.sin(a) * (rr - 2.2));
          gg.lineTo(Math.cos(a) * (rr + 0.6), Math.sin(a) * (rr + 0.6)); gg.stroke();
        }
      }
      for (const ga of gateAt) {
        gg.strokeStyle = "rgba(205,195,175,.3)"; gg.lineWidth = 1;
        gg.beginPath(); gg.moveTo(Math.cos(ga) * R * 0.07, Math.sin(ga) * R * 0.07);
        gg.lineTo(Math.cos(ga) * R * 0.56, Math.sin(ga) * R * 0.56); gg.stroke();
      }
      gg.fillStyle = "rgba(242,232,212,.9)";
      gg.beginPath(); gg.arc(0, 0, R * 0.045, 0, TAU); gg.fill();
    });
    // gate beacons — cool sparks where roads cross walls
    s.spot(ge, CIT.lon, CIT.lat, (gg, f) => {
      for (let ring = 1; ring <= 3; ring++) {
        const rr = R * 0.155 * ring * (0.6 + f * 0.55);
        for (const ga of gateAt) {
          gg.fillStyle = "rgba(185,225,255,.85)";
          gg.beginPath(); gg.arc(Math.cos(ga) * rr, Math.sin(ga) * rr, 1.7, 0, TAU); gg.fill();
        }
      }
      gg.fillStyle = "rgba(230,240,255,.7)";
      gg.beginPath(); gg.arc(0, 0, R * 0.05, 0, TAU); gg.fill();
    });
    s.spot(g, CIT.lon, CIT.lat, (gg, f) => {
      for (let ring = 1; ring <= 3; ring++) {
        const rr = R * 0.155 * ring * (0.6 + f * 0.55);
        for (const ga of gateAt) {
          gg.fillStyle = "rgba(200,232,255,.9)";
          gg.beginPath(); gg.arc(Math.cos(ga) * rr, Math.sin(ga) * rr, 1.4, 0, TAU); gg.fill();
        }
      }
    });
    // THE BREACH — through the middle ring at a non-gate angle, hottest point
    s.spot(g, CIT.lon, CIT.lat, (gg, f) => {
      const a = 3.5, rr = R * 0.155 * 2 * (0.6 + f * 0.55);
      const bx = Math.cos(a) * rr, by = Math.sin(a) * rr;
      gg.fillStyle = "rgba(8,6,8,.9)";
      gg.beginPath(); gg.ellipse(bx, by, R * 0.055, R * 0.035, a, 0, TAU); gg.fill();
      for (let i = 0; i < 16; i++) {
        const fan = a + (rnd() - 0.5) * 0.9, d = R * (0.05 + rnd() * 0.24);
        gg.strokeStyle = `rgba(255,${170 + Math.floor(rnd() * 50)},120,${0.35 + rnd() * 0.35})`;
        gg.lineWidth = 0.8 + rnd() * 0.8;
        gg.beginPath(); gg.moveTo(bx, by);
        gg.lineTo(bx + Math.cos(fan) * d, by + Math.sin(fan) * d); gg.stroke();
      }
    });
    s.spot(ge, CIT.lon, CIT.lat, (gg, f) => {
      const a = 3.5, rr = R * 0.155 * 2 * (0.6 + f * 0.55);
      const bx = Math.cos(a) * rr, by = Math.sin(a) * rr;
      const m = gg.createRadialGradient(bx, by, 0, bx, by, R * 0.14);
      m.addColorStop(0, "rgba(255,190,130,.95)"); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = m; gg.beginPath(); gg.arc(bx, by, R * 0.14, 0, TAU); gg.fill();
    });
    dust(p, 90, "rgba(235,225,205,.05)", "rgba(10,8,10,.09)");
  },

  /* pi-eval — THE MERIDIAN WORLD. Ivory porcelain fully surveyed: graticule
     across the whole disc, a beaded gold prime meridian, real observatory
     domes on the crossings. */
  "pi-eval": (p) => {
    const { g, ge, cx, cy, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.42);
    // porcelain wash — ivory lit side, hue held for shadow and atmosphere
    g.fillStyle = "rgba(242,244,248,.34)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    for (let r = 0; r < 6; r++) {
      const lat0 = -1.2 + (r / 6) * 2.4, lat1 = lat0 + 0.4;
      for (let c2 = 0; c2 < 6; c2++) {
        if ((r + c2) % 2) continue;
        const lon0 = -Math.PI / 2 + (c2 / 6) * Math.PI;
        if (s.cell(g, lon0, lon0 + Math.PI / 6, lat0, lat1)) {
          g.fillStyle = rgba(mix(hue, "#dfe9ff", 0.5), 0.07); g.fill();
        }
      }
    }
    // full graticule, strong enough to read on the lit side
    g.strokeStyle = "rgba(110,130,170,.5)"; g.lineWidth = 0.55;
    for (let i = -5; i <= 5; i++) { g.beginPath(); s.latLine(g, i * 0.22); g.stroke(); }
    for (let i = -5; i <= 5; i++) { g.beginPath(); s.meridian(g, i * 0.26); g.stroke(); }
    for (let i = 1; i <= 3; i++) {
      g.strokeStyle = "rgba(130,150,190,.45)"; g.lineWidth = 0.5;
      g.beginPath(); s.latLine(g, 1.02 + i * 0.09); g.stroke();
    }
    // the prime meridian — gold, beaded by degrees, hero bead at the equator
    g.strokeStyle = rgba("#e8c05a", 0.95); g.lineWidth = 1.6;
    g.beginPath(); s.meridian(g, 0.13, -1.35, 1.35); g.stroke();
    ge.strokeStyle = rgba("#ffd98a", 0.4); ge.lineWidth = 2;
    ge.beginPath(); s.meridian(ge, 0.13, -1.3, 1.3); ge.stroke();
    for (let i = -5; i <= 5; i++) {
      s.spot(g, 0.13, i * 0.2, (gg) => {
        gg.fillStyle = rgba("#ffe9ac", 0.98);
        gg.beginPath(); gg.arc(0, 0, i === 0 ? 2.6 : 1.4, 0, TAU); gg.fill();
      });
    }
    s.spot(ge, 0.13, 0, (gg) => {
      gg.fillStyle = rgba("#ffe9ac", 0.9);
      gg.beginPath(); gg.arc(0, 0, 2.8, 0, TAU); gg.fill();
    });
    // observatories — lit domes with cast shadows on graticule crossings
    const domes: [number, number, boolean][] = [[-0.78, 0.44, false], [0.65, -0.22, true], [-0.26, -0.66, false]];
    for (const [dl, dt, open] of domes) {
      s.spot(g, dl, dt, (gg) => {
        gg.fillStyle = "rgba(30,36,54,.4)";
        gg.beginPath(); gg.ellipse(R * 0.02, R * 0.014, R * 0.05, R * 0.018, 0, 0, TAU); gg.fill();
        gg.fillStyle = "rgba(238,242,252,.98)";
        gg.beginPath(); gg.arc(0, 0, R * 0.05, Math.PI, TAU); gg.closePath(); gg.fill();
        gg.strokeStyle = "rgba(90,105,140,.7)"; gg.lineWidth = 0.8;
        gg.beginPath(); gg.moveTo(0, -R * 0.05); gg.lineTo(0, 0); gg.stroke();
        gg.fillStyle = "rgba(60,72,100,.6)";
        gg.fillRect(-R * 0.055, 0, R * 0.11, R * 0.016);
      });
      if (open) s.spot(ge, dl, dt, (gg) => {
        gg.strokeStyle = "rgba(200,225,255,.9)"; gg.lineWidth = 1.3;
        gg.beginPath(); gg.moveTo(0, -R * 0.045); gg.lineTo(R * 0.07, -R * 0.19); gg.stroke();
        gg.fillStyle = "rgba(225,240,255,.7)";
        gg.beginPath(); gg.arc(0, -R * 0.045, 1.6, 0, TAU); gg.fill();
      });
    }
    dust(p, 50, "rgba(255,255,255,.06)", "rgba(140,155,190,.08)");
    void rnd;
  },

  /* agentic-dev-harness — THE FIVE-RING CITY. Half the disc is the city:
     five luminous rings dotted with warm windows, radial spokes, straddling
     the terminator so the loop burns into the night. */
  "agentic-dev-harness": (p) => {
    const { g, ge, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.4);
    // day side: quiet continents with true street-grid hatch, ragged coasts
    for (let i = 0; i < 4; i++) {
      s.spot(g, -0.95 + rnd() * 0.7, (rnd() - 0.5) * 1.6, (gg) => {
        const rr = R * (0.13 + rnd() * 0.15);
        gg.fillStyle = rgba(mix(hue, "#33443a", 0.55), 0.45);
        gg.beginPath();
        for (let k = 0; k <= 11; k++) {
          const a = (k / 11) * TAU, r2 = rr * (0.55 + rnd() * 0.75);
          if (k === 0) gg.moveTo(Math.cos(a) * r2, Math.sin(a) * r2); else gg.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        }
        gg.closePath(); gg.fill();
        gg.save(); gg.clip();
        gg.strokeStyle = "rgba(255,255,255,.12)"; gg.lineWidth = 0.4;
        for (let k = -4; k <= 4; k++) {
          gg.beginPath(); gg.moveTo(-rr, k * rr * 0.24); gg.lineTo(rr, k * rr * 0.24); gg.stroke();
          gg.beginPath(); gg.moveTo(k * rr * 0.24, -rr); gg.lineTo(k * rr * 0.24, rr); gg.stroke();
        }
        gg.restore();
      });
    }
    // the city — five rings + spokes + window speckle, straddling the dark
    const CITY = { lon: 0.45, lat: -0.1 };
    s.spot(g, CITY.lon, CITY.lat, (gg, f) => {
      // night ground under the city: lights need dark to be lights
      const ground = gg.createRadialGradient(0, 0, 0, 0, 0, R * 0.68 * (0.6 + f * 0.5));
      ground.addColorStop(0, "rgba(4,6,14,.72)"); ground.addColorStop(0.8, "rgba(4,6,14,.5)");
      ground.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = ground;
      gg.beginPath(); gg.arc(0, 0, R * 0.68 * (0.6 + f * 0.5), 0, TAU); gg.fill();
      const warm = ["255,214,150", "255,190,130", "190,225,255", "255,240,200", "170,240,220"];
      for (let ring = 1; ring <= 5; ring++) {
        const rr = R * 0.135 * ring * (0.6 + f * 0.5);
        const n = 14 + ring * 9;
        for (let k = 0; k < n; k++) {
          if (rnd() < 0.16) continue;
          const a = (k / n) * TAU + ring * 0.3;
          gg.fillStyle = `rgba(${warm[ring - 1]},${0.6 + rnd() * 0.4})`;
          gg.fillRect(Math.cos(a) * rr - 0.9, Math.sin(a) * rr - 0.9, 1.6 + rnd() * 1.4, 1.6 + rnd() * 1.4);
        }
      }
      // window speckle between the rings — a city, not a diagram
      for (let k = 0; k < 130; k++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.5 * (0.6 + f * 0.5);
        gg.fillStyle = `rgba(255,${205 + Math.floor(rnd() * 40)},${150 + Math.floor(rnd() * 60)},${0.25 + rnd() * 0.4})`;
        gg.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 0.9, 0.9);
      }
      for (let sp2 = 0; sp2 < 8; sp2++) {
        const a = (sp2 / 8) * TAU + 0.26;
        gg.strokeStyle = "rgba(255,220,160,.5)"; gg.lineWidth = 1;
        gg.setLineDash([2.2, 2.6]);
        gg.beginPath(); gg.moveTo(Math.cos(a) * R * 0.07, Math.sin(a) * R * 0.07);
        gg.lineTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62); gg.stroke();
        gg.setLineDash([]);
      }
      gg.fillStyle = "rgba(255,246,220,.98)";
      gg.beginPath(); gg.arc(0, 0, R * 0.035, 0, TAU); gg.fill();
    });
    s.spot(ge, CITY.lon, CITY.lat, (gg, f) => {
      // dotted lit rings — window-strings, never a solid vinyl bullseye
      for (let ring = 1; ring <= 5; ring++) {
        const rr = R * 0.135 * ring * (0.6 + f * 0.5);
        gg.strokeStyle = `rgba(255,${200 - ring * 8},${140 + ring * 12},${0.4 - ring * 0.03})`;
        gg.lineWidth = 1.4;
        gg.setLineDash([2, 3.6]);
        gg.beginPath(); gg.ellipse(0, 0, rr, rr, 0, 0, TAU); gg.stroke();
        gg.setLineDash([]);
      }
      for (let sp2 = 0; sp2 < 4; sp2++) {
        const a = (sp2 / 4) * TAU + 0.26;
        gg.strokeStyle = "rgba(255,220,160,.4)"; gg.lineWidth = 1;
        gg.setLineDash([1.6, 3]);
        gg.beginPath(); gg.moveTo(Math.cos(a) * R * 0.07, Math.sin(a) * R * 0.07);
        gg.lineTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); gg.stroke();
        gg.setLineDash([]);
      }
      gg.fillStyle = "rgba(255,240,200,.95)";
      gg.beginPath(); gg.arc(0, 0, R * 0.038, 0, TAU); gg.fill();
    });
    dust(p, 70, "rgba(255,235,200,.05)", "rgba(6,8,12,.1)");
  },

  /* pi-gates — THE FORTRESS WORLD. Great curtain walls with lit crests and
     watch-fires, a bastion at the crossing, settlements sheltering inside,
     and ONE open gate flaring warm. */
  "pi-gates": (p) => {
    const { g, ge, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.44);
    mottle(p, s, 12, "rgba(38,42,52,1)", "rgba(16,18,26,1)", 0.3);
    g.fillStyle = rgba(mix(hue, "#3a4258", 0.5), 0.22);
    s.band(g, -0.28, 0.46); g.fill();
    const wall = (draw: (gc: Ctx) => void, tickAt: (i: number) => { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }) => {
      g.strokeStyle = "rgba(6,8,12,.85)"; g.lineWidth = 5;
      g.beginPath(); draw(g); g.stroke();
      g.strokeStyle = "rgba(228,236,248,.7)"; g.lineWidth = 1.5;
      g.beginPath(); draw(g); g.stroke();
      for (let i = 0; i < 22; i++) {
        const { a, b } = tickAt(i);
        if (a.z <= 0.05 || b.z <= 0.05) continue;
        g.strokeStyle = "rgba(220,230,244,.55)"; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        if (i % 3 === 0) {
          ge.fillStyle = "rgba(255,196,130,.75)";
          ge.beginPath(); ge.arc(a.x, a.y, 1.6, 0, TAU); ge.fill();
          g.fillStyle = "rgba(255,214,155,.9)";
          g.beginPath(); g.arc(a.x, a.y, 1.3, 0, TAU); g.fill();
        }
      }
    };
    wall(
      (gc) => s.latLine(gc, -0.28),
      (i) => {
        const le = s.limbLon(-0.28), lon = -le + (i / 21) * 2 * le;
        return { a: s.pt(lon, -0.235), b: s.pt(lon, -0.325) };
      }
    );
    wall(
      (gc) => s.meridian(gc, 0.52, -1.3, 1.3),
      (i) => {
        const lat = -1.2 + (i / 21) * 2.4;
        return { a: s.pt(0.565, lat), b: s.pt(0.475, lat) };
      }
    );
    s.spot(g, 0.52, -0.28, (gg) => {
      gg.fillStyle = "rgba(225,232,245,.9)";
      gg.beginPath();
      for (let k = 0; k <= 5; k++) {
        const a = (k / 5) * TAU - 0.3;
        if (k === 0) gg.moveTo(Math.cos(a) * R * 0.045, Math.sin(a) * R * 0.045);
        else gg.lineTo(Math.cos(a) * R * 0.045, Math.sin(a) * R * 0.045);
      }
      gg.closePath(); gg.fill();
    });
    // settlements inside the walls — small warm clusters the walls protect
    for (const [sl, st] of [[0.1, 0.1], [-0.15, 0.28], [0.32, -0.05]] as const) {
      s.spot(ge, sl, st, (gg) => {
        for (let k = 0; k < 5; k++) {
          gg.fillStyle = "rgba(255,214,160,.55)";
          gg.fillRect((rnd() - 0.5) * R * 0.06, (rnd() - 0.5) * R * 0.04, 1, 1);
        }
      });
    }
    // THE OPEN GATE — its own event, light pooling out onto the road
    s.spot(g, -0.42, -0.28, (gg) => {
      gg.fillStyle = "rgba(255,228,170,.95)";
      gg.fillRect(-2.4, -3.6, 4.8, 6.4);
      gg.strokeStyle = "rgba(210,200,180,.45)"; gg.lineWidth = 1.1;
      gg.setLineDash([2.2, 2.8]);
      gg.beginPath(); gg.moveTo(0, 3); gg.lineTo(-R * 0.09, R * 0.22); gg.stroke();
      gg.setLineDash([]);
      const pool = gg.createRadialGradient(0, R * 0.05, 0, 0, R * 0.05, R * 0.09);
      pool.addColorStop(0, "rgba(255,224,160,.4)"); pool.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = pool;
      gg.beginPath(); gg.ellipse(0, R * 0.05, R * 0.09, R * 0.045, 0, 0, TAU); gg.fill();
    });
    s.spot(ge, -0.42, -0.28, (gg) => {
      const m = gg.createRadialGradient(0, 0, 0, 0, 0, R * 0.13);
      m.addColorStop(0, "rgba(255,224,160,.95)"); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = m; gg.beginPath(); gg.arc(0, 0, R * 0.13, 0, TAU); gg.fill();
    });
    dust(p, 80, "rgba(225,232,245,.05)", "rgba(6,8,12,.1)");
  },

  /* harness-builder — THE SURVEYED STORM. A great spiral storm nearly half
     the disc wide, sheared bands curling into it — and cyan instrumentation
     all over it: contours, tick crosses, a crosshair and a reticle callout. */
  "harness-builder": (p) => {
    const { g, ge, rnd, fbm, R, TAU } = p;
    const s = sphere(p, 0.38);
    for (let i = 0; i < 13; i++) {
      const lat = -1.25 + (i / 12) * 2.5, w = 0.08 + rnd() * 0.09;
      const dr = (lon: number) => (fbm(lon * 1.6 + i * 2.3, lat * 5) - 0.5) * 0.16;
      g.fillStyle = i % 2 ? `rgba(255,196,120,${0.2 + rnd() * 0.1})` : `rgba(74,36,16,${0.28 + rnd() * 0.12})`;
      s.band(g, lat, lat + w, dr); g.fill();
    }
    for (let i = 0; i < 6; i++) {
      const lat = (rnd() - 0.5) * 2;
      g.strokeStyle = `rgba(255,235,200,${0.16 + rnd() * 0.12})`; g.lineWidth = 0.7;
      g.beginPath();
      const le = s.limbLon(lat), l0 = s.lon0(lat) + rnd() * le;
      for (let k = 0; k <= 12; k++) {
        const lon = l0 + (k / 12) * 0.8;
        const q = s.pt(lon, lat + (fbm(lon * 3, lat * 8) - 0.5) * 0.04);
        if (k === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      }
      g.stroke();
    }
    const ST = { lon: 0.42, lat: -0.32 };
    // the great storm — oval spiral ~0.45R wide with curling arms
    s.spot(g, ST.lon, ST.lat, (gg, f) => {
      const k2 = 0.6 + f * 0.5;
      for (let i = 4; i >= 0; i--) {
        const rr = R * (0.055 + i * 0.048) * k2;
        gg.save(); gg.rotate(-0.35 - i * 0.24);
        gg.fillStyle = i === 0 ? "rgba(255,248,228,.95)" : `rgba(${i % 2 ? "255,205,155" : "140,64,26"},${0.4 - i * 0.05})`;
        gg.beginPath(); gg.ellipse(0, 0, rr, rr * 0.62, 0, 0, TAU); gg.fill();
        gg.restore();
      }
      for (const sgn of [-1, 1]) {
        gg.strokeStyle = "rgba(255,228,185,.55)"; gg.lineWidth = 1.4;
        gg.beginPath();
        for (let a = 0; a < 3.1; a += 0.18) {
          const rr = (R * 0.1 + a * R * 0.075) * k2;
          const px = Math.cos(a * sgn + 1.2) * rr, py = Math.sin(a * sgn + 1.2) * rr * 0.62;
          if (a === 0) gg.moveTo(px, py); else gg.lineTo(px, py);
        }
        gg.stroke();
      }
    });
    s.spot(ge, ST.lon, ST.lat, (gg) => {
      gg.fillStyle = "rgba(255,242,210,.85)";
      gg.beginPath(); gg.ellipse(0, 0, R * 0.045, R * 0.028, -0.35, 0, TAU); gg.fill();
    });
    // the survey — full-saturation cyan instrumentation OVER the amber
    s.spot(g, ST.lon, ST.lat, (gg, f) => {
      const k2 = 0.6 + f * 0.5;
      gg.strokeStyle = "rgba(105,240,255,.85)"; gg.lineWidth = 1;
      gg.setLineDash([3, 3]);
      for (let i = 1; i <= 3; i++) {
        const rr = R * (0.13 + i * 0.09) * k2;
        gg.beginPath(); gg.ellipse(0, 0, rr, rr * 0.62, -0.35, 0, TAU); gg.stroke();
      }
      gg.setLineDash([]);
      // crosshair on the eye
      gg.strokeStyle = "rgba(140,246,255,.95)"; gg.lineWidth = 1;
      gg.beginPath(); gg.moveTo(-R * 0.07, 0); gg.lineTo(R * 0.07, 0);
      gg.moveTo(0, -R * 0.05); gg.lineTo(0, R * 0.05); gg.stroke();
      // tick crosses on the middle contour
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.4, rr = R * 0.22 * k2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.62;
        gg.strokeStyle = "rgba(105,240,255,.9)"; gg.lineWidth = 0.9;
        gg.beginPath(); gg.moveTo(px - 2.8, py); gg.lineTo(px + 2.8, py);
        gg.moveTo(px, py - 2.8); gg.lineTo(px, py + 2.8); gg.stroke();
      }
      // leader line to the annotation reticle
      gg.strokeStyle = "rgba(105,240,255,.8)"; gg.lineWidth = 0.9;
      gg.beginPath(); gg.moveTo(R * 0.08, -R * 0.05); gg.lineTo(R * 0.3, -R * 0.24); gg.stroke();
      gg.strokeRect(R * 0.3, -R * 0.3, R * 0.13, R * 0.08);
      gg.beginPath(); gg.moveTo(R * 0.32, -R * 0.27); gg.lineTo(R * 0.41, -R * 0.27);
      gg.moveTo(R * 0.32, -R * 0.245); gg.lineTo(R * 0.38, -R * 0.245); gg.stroke();
    });
    // stray survey ticks across the lit disc
    for (let i = 0; i < 5; i++) {
      s.spot(g, (rnd() - 0.5) * 2, (rnd() - 0.5) * 1.6, (gg) => {
        gg.strokeStyle = "rgba(105,240,255,.6)"; gg.lineWidth = 0.7;
        gg.beginPath(); gg.moveTo(-2, 0); gg.lineTo(2, 0); gg.moveTo(0, -2); gg.lineTo(0, 2); gg.stroke();
      });
    }
    s.spot(ge, ST.lon, ST.lat, (gg) => {
      gg.strokeStyle = "rgba(140,246,255,.55)"; gg.lineWidth = 0.8;
      gg.strokeRect(R * 0.3, -R * 0.3, R * 0.13, R * 0.08);
    });
    dust(p, 90, "rgba(255,240,210,.05)", "rgba(30,12,4,.09)");
  },

  /* agent-graph — THE NEURAL WORLD. A deep indigo night-sphere whose only
     light is the graph: emissive hubs, a web across most of the disc, and
     one trajectory burning end to end. */
  "agent-graph": (p) => {
    const { g, ge, cx, cy, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.46);
    g.fillStyle = "rgba(7,9,22,.68)"; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const N: { lon: number; lat: number; deg: number }[] = [];
    for (let i = 0; i < 16; i++) {
      N.push({ lon: (rnd() - 0.5) * 2.9, lat: (rnd() - 0.5) * 2.4, deg: 0 });
    }
    const E: [number, number][] = [];
    for (let i = 0; i < N.length; i++) {
      const links = i < 3 ? 3 : 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < links; k++) {
        const j = Math.floor(rnd() * N.length);
        if (j !== i && !E.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) {
          E.push([i, j]); N[i].deg++; N[j].deg++;
        }
      }
    }
    const edgePath = (gc: Ctx, a: typeof N[0], b: typeof N[0]) => {
      let started = false;
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        const q = s.pt(a.lon + (b.lon - a.lon) * u, a.lat + (b.lat - a.lat) * u + Math.sin(u * Math.PI) * 0.08);
        if (q.z <= 0.04) { started = false; continue; }
        if (!started) { gc.moveTo(q.x, q.y); started = true; } else gc.lineTo(q.x, q.y);
      }
    };
    for (const [i, j] of E) {
      g.strokeStyle = rgba(mix(hue, "#9cc2ff", 0.55), 0.38); g.lineWidth = 0.6;
      g.beginPath(); edgePath(g, N[i], N[j]); g.stroke();
    }
    // the scored trajectory — twice as bright as anything else, beaded
    const path = E.slice(0, 3);
    for (const [i, j] of path) {
      g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1.3;
      g.beginPath(); edgePath(g, N[i], N[j]); g.stroke();
      ge.strokeStyle = rgba(mix(hue, "#d5e8ff", 0.75), 0.65); ge.lineWidth = 1.8;
      ge.beginPath(); edgePath(ge, N[i], N[j]); ge.stroke();
      for (const u of [0.35, 0.72]) {
        const q = s.pt(N[i].lon + (N[j].lon - N[i].lon) * u, N[i].lat + (N[j].lat - N[i].lat) * u + Math.sin(u * Math.PI) * 0.08);
        if (q.z > 0.05) {
          ge.fillStyle = "rgba(235,245,255,.95)";
          ge.beginPath(); ge.arc(q.x, q.y, 1.6, 0, TAU); ge.fill();
        }
      }
    }
    // dim packets on secondary edges
    for (let k = 0; k < 5; k++) {
      const [i, j] = E[Math.floor(rnd() * E.length)];
      const u = 0.3 + rnd() * 0.4;
      const q = s.pt(N[i].lon + (N[j].lon - N[i].lon) * u, N[i].lat + (N[j].lat - N[i].lat) * u + Math.sin(u * Math.PI) * 0.08);
      if (q.z <= 0.05) continue;
      ge.fillStyle = "rgba(200,225,255,.5)";
      ge.beginPath(); ge.arc(q.x, q.y, 1, 0, TAU); ge.fill();
    }
    // every node luminous; hubs unmistakable
    N.forEach((n) => {
      s.spot(g, n.lon, n.lat, (gg) => {
        const rr = 1.3 + n.deg * 0.75;
        gg.fillStyle = rgba(mix(hue, "#eef5ff", 0.7), 0.98);
        gg.beginPath(); gg.arc(0, 0, rr, 0, TAU); gg.fill();
      });
      s.spot(ge, n.lon, n.lat, (gg) => {
        const rr = 1.6 + n.deg * 0.7;
        const m = gg.createRadialGradient(0, 0, 0, 0, 0, rr * 2.4);
        m.addColorStop(0, rgba(mix(hue, "#dceaff", 0.75), n.deg >= 3 ? 0.95 : 0.55));
        m.addColorStop(1, "rgba(0,0,0,0)");
        gg.fillStyle = m; gg.beginPath(); gg.arc(0, 0, rr * 2.4, 0, TAU); gg.fill();
      });
    });
    dust(p, 60, "rgba(200,220,255,.05)", "rgba(4,6,14,.1)");
  },

  /* mcp-tools — THE DOCKING WORLD. Six big hexagonal port bays over half the
     disc, iris doors and rim lights, service lanes between them — one bay
     open with a beam standing off the surface. */
  "mcp-tools": (p) => {
    const { g, ge, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.42);
    // brushed hull: fine latitude streaks + a few panel seam arcs
    for (let i = 0; i < 15; i++) {
      const lat = -1.3 + (i / 14) * 2.6;
      g.strokeStyle = `rgba(210,225,240,${0.05 + (i % 2) * 0.03})`; g.lineWidth = 0.45;
      g.beginPath(); s.latLine(g, lat); g.stroke();
    }
    for (const lon of [-0.55, 0.35, 1.05]) {
      g.strokeStyle = "rgba(180,200,220,.16)"; g.lineWidth = 0.8;
      g.beginPath(); s.meridian(g, lon); g.stroke();
    }
    const bays: [number, number][] = [[-0.75, 0.6], [0.2, 0.72], [0.88, 0.02], [-0.08, -0.05], [-0.88, -0.55], [0.5, -0.62]];
    const OPEN = 3;
    bays.forEach(([bl, bt], bi) => {
      s.spot(g, bl, bt, (gg) => {
        const rr = R * 0.14;
        const hexa = (r2: number) => {
          gg.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * TAU + 0.26;
            if (k === 0) gg.moveTo(Math.cos(a) * r2, Math.sin(a) * r2); else gg.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
          }
          gg.closePath();
        };
        gg.fillStyle = "rgba(10,14,22,.7)"; hexa(rr); gg.fill();
        gg.strokeStyle = "rgba(228,240,252,.7)"; gg.lineWidth = 1.2; hexa(rr); gg.stroke();
        gg.strokeStyle = "rgba(150,170,195,.5)"; gg.lineWidth = 0.6; hexa(rr * 0.72); gg.stroke();
        if (bi === OPEN) {
          gg.fillStyle = rgba(mix(hue, "#9fe9ff", 0.65), 0.9); hexa(rr * 0.52); gg.fill();
        } else {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + 0.26;
            gg.strokeStyle = "rgba(130,150,175,.6)"; gg.lineWidth = 0.6;
            gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(Math.cos(a) * rr * 0.72, Math.sin(a) * rr * 0.72); gg.stroke();
          }
        }
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.78;
          gg.fillStyle = bi === OPEN ? "rgba(190,242,255,.95)" : "rgba(205,220,240,.7)";
          gg.beginPath(); gg.arc(Math.cos(a) * rr * 0.88, Math.sin(a) * rr * 0.88, 1, 0, TAU); gg.fill();
        }
      });
    });
    // service lanes — light dashed arcs bay to bay, plus one cross-link
    const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 3]];
    for (const [i, j] of links) {
      const a = s.pt(bays[i][0], bays[i][1]), b = s.pt(bays[j][0], bays[j][1]);
      if (a.z <= 0.05 || b.z <= 0.05) continue;
      g.strokeStyle = "rgba(215,235,252,.5)"; g.lineWidth = 1.1;
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(a.x, a.y);
      g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - R * 0.04, b.x, b.y); g.stroke();
      g.setLineDash([]);
    }
    // the open bay's beam
    s.spot(ge, bays[OPEN][0], bays[OPEN][1], (gg) => {
      gg.fillStyle = rgba(mix(hue, "#b8f0ff", 0.75), 0.9);
      gg.beginPath(); gg.arc(0, 0, R * 0.075, 0, TAU); gg.fill();
      const beam = gg.createLinearGradient(0, 0, 0, -R * 0.42);
      beam.addColorStop(0, rgba(mix(hue, "#b8f0ff", 0.75), 0.6)); beam.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = beam;
      gg.beginPath(); gg.moveTo(-R * 0.045, 0); gg.lineTo(R * 0.045, 0);
      gg.lineTo(R * 0.085, -R * 0.42); gg.lineTo(-R * 0.085, -R * 0.42); gg.closePath(); gg.fill();
    });
    s.spot(g, bays[OPEN][0], bays[OPEN][1], (gg) => {
      const beam = gg.createLinearGradient(0, 0, 0, -R * 0.34);
      beam.addColorStop(0, "rgba(210,244,255,.4)"); beam.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = beam;
      gg.beginPath(); gg.moveTo(-R * 0.04, 0); gg.lineTo(R * 0.04, 0);
      gg.lineTo(R * 0.075, -R * 0.34); gg.lineTo(-R * 0.075, -R * 0.34); gg.closePath(); gg.fill();
    });
    dust(p, 60, "rgba(220,235,250,.06)", "rgba(8,12,18,.08)");
    void rnd;
  },

  /* llm-gateway — THE INTERCHANGE. Bright dashed lanes sweep in from both
     limbs and converge on a REAL toll arch standing on the equator, caravans
     bunching as they queue for the gate. */
  "llm-gateway": (p) => {
    const { g, ge, rnd, fbm, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.4);
    for (let i = 0; i < 7; i++) {
      const lat = -1.15 + (i / 6) * 2.3, w = 0.16 + rnd() * 0.1;
      const dr = (lon: number) => (fbm(lon * 0.7 + i * 2.2, lat * 3) - 0.5) * 0.05;
      g.fillStyle = i % 2 ? rgba(mix(hue, "#d7f5e2", 0.45), 0.11) : rgba(mix(hue, "#0c2418", 0.5), 0.16);
      s.band(g, lat, lat + w, dr); g.fill();
    }
    const ARCH = { lon: 0.24, lat: 0.02 };
    const lane = (fromLat: number, sgn: number, off: number) => {
      const pts: { x: number; y: number; z: number }[] = [];
      for (let k = 0; k <= 22; k++) {
        const u = k / 22;
        const lon = ARCH.lon + sgn * (1.35 * (1 - u) + 0.02) + off * (1 - u) * 0.3;
        const lat = ARCH.lat + (fromLat - ARCH.lat) * (1 - u) * (1 - u);
        pts.push(s.pt(lon, lat));
      }
      g.strokeStyle = "rgba(236,255,244,.6)"; g.lineWidth = 1.1;
      g.setLineDash([3.2, 2.6]);
      g.beginPath();
      let started = false;
      for (const q of pts) {
        if (q.z <= 0.04) { started = false; continue; }
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke(); g.setLineDash([]);
      // caravans queue: five discrete beads, tightest right at the arch
      for (let k = 0; k < 5; k++) {
        const q = pts[21 - k];
        if (!q || q.z <= 0.05) continue;
        g.fillStyle = "rgba(255,255,255,.9)";
        g.beginPath(); g.arc(q.x, q.y, 1.5, 0, TAU); g.fill();
        if (k < 3) { ge.fillStyle = "rgba(235,255,244,.8)"; ge.beginPath(); ge.arc(q.x, q.y, 1.6, 0, TAU); ge.fill(); }
      }
    };
    for (const [fl, off] of [[-0.7, -1], [-0.2, -0.3], [0.35, 0.4], [0.8, 1]] as const) lane(fl, -1, off);
    for (const [fl, off] of [[-0.55, -0.8], [0.1, 0], [0.6, 0.8]] as const) lane(fl, 1, off);
    // THE TOLL ARCH — a real gate, 0.2R tall, brightest structure on the disc
    s.spot(g, ARCH.lon, ARCH.lat, (gg) => {
      gg.strokeStyle = "rgba(255,253,240,.98)"; gg.lineWidth = 2.4;
      gg.beginPath(); gg.moveTo(-R * 0.075, R * 0.07); gg.lineTo(-R * 0.075, -R * 0.05);
      gg.arc(0, -R * 0.05, R * 0.075, Math.PI, TAU);
      gg.lineTo(R * 0.075, R * 0.07); gg.stroke();
      gg.fillStyle = "rgba(255,253,240,.95)";
      gg.fillRect(-R * 0.09, R * 0.06, R * 0.035, R * 0.024);
      gg.fillRect(R * 0.055, R * 0.06, R * 0.035, R * 0.024);
      gg.strokeStyle = "rgba(255,253,240,.5)"; gg.lineWidth = 1;
      gg.beginPath(); gg.moveTo(-R * 0.045, -R * 0.02); gg.lineTo(R * 0.045, -R * 0.02); gg.stroke();
    });
    s.spot(ge, ARCH.lon, ARCH.lat, (gg) => {
      const m = gg.createRadialGradient(0, -R * 0.03, 0, 0, -R * 0.03, R * 0.13);
      m.addColorStop(0, "rgba(248,255,246,.98)"); m.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = m; gg.beginPath(); gg.arc(0, -R * 0.03, R * 0.13, 0, TAU); gg.fill();
      gg.strokeStyle = "rgba(255,253,240,.7)"; gg.lineWidth = 1.6;
      gg.beginPath(); gg.moveTo(-R * 0.075, R * 0.06); gg.lineTo(-R * 0.075, -R * 0.05);
      gg.arc(0, -R * 0.05, R * 0.075, Math.PI, TAU);
      gg.lineTo(R * 0.075, R * 0.06); gg.stroke();
    });
    for (const sgn of [-1, 1]) {
      g.strokeStyle = "rgba(235,255,245,.2)"; g.lineWidth = 0.6;
      g.beginPath();
      for (let a = 0; a < 1.6; a += 0.2) {
        const q = s.pt(ARCH.lon + 0.3 + a * 0.14, ARCH.lat + sgn * Math.sin(a * 2) * 0.06);
        if (a === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      }
      g.stroke();
    }
    dust(p, 70, "rgba(235,255,245,.05)", "rgba(4,14,10,.08)");
  },

  /* match3-engine — THE TESSELLATED WORLD. A three-albedo hex board over the
     sphere; the matched TRIPLE flares gold — brightest thing on the disc —
     while the column above it hangs dashed, about to fall. */
  "match3-engine": (p) => {
    const { g, ge, rnd, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.44);
    const tones = [
      rgba(mix(hue, "#ffffff", 0.35), 0.34),
      rgba(mix(hue, "#1a1030", 0.6), 0.4),
      rgba(mix(hue, "#3d1d5e", 0.65), 0.34),
    ];
    const DL = 0.31, DT = 0.27;
    for (let r = -4; r <= 4; r++) {
      for (let q = -5; q <= 5; q++) {
        const lon = q * DL + (r % 2 ? DL / 2 : 0), lat = r * DT;
        const tone = ((q + 20) * 2 + (r + 20) * 3 + ((q * r) % 2 === 0 ? 0 : 1)) % 3;
        s.spot(g, lon, lat, (gg, f) => {
          gg.fillStyle = tones[tone];
          gg.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * TAU + TAU / 12;
            const rr = R * 0.085 * (0.75 + f * 0.3);
            if (k === 0) gg.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          gg.closePath(); gg.fill();
          gg.strokeStyle = "rgba(8,6,14,.45)"; gg.lineWidth = 0.55; gg.stroke();
        });
      }
    }
    // THE TRIPLE — gold, flaring, with one shared bloom over all three
    for (let q = -1; q <= 1; q++) {
      const lon = q * DL, lat = 0;
      s.spot(g, lon, lat, (gg, f) => {
        const rr = R * 0.085 * (0.75 + f * 0.3);
        gg.fillStyle = rgba(mix(hue, "#ffd76a", 0.75), 0.95);
        gg.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * TAU + TAU / 12;
          if (k === 0) gg.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        gg.closePath(); gg.fill();
        gg.strokeStyle = "rgba(255,255,255,.95)"; gg.lineWidth = 1.3; gg.stroke();
      });
      s.spot(ge, lon, lat, (gg, f) => {
        const rr = R * 0.075 * (0.75 + f * 0.3);
        gg.fillStyle = rgba(mix(hue, "#ffe49a", 0.8), 0.9);
        gg.beginPath(); gg.arc(0, 0, rr, 0, TAU); gg.fill();
      });
      // the dashed column above — falling next
      s.spot(g, lon + DL / 2, DT * 2, (gg, f) => {
        const rr = R * 0.085 * (0.75 + f * 0.3);
        gg.strokeStyle = "rgba(255,255,255,.75)"; gg.lineWidth = 0.9;
        gg.setLineDash([2.4, 2.2]);
        gg.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * TAU + TAU / 12;
          if (k === 0) gg.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        gg.closePath(); gg.stroke();
        gg.setLineDash([]);
        // a chevron pointing down toward the flare
        gg.strokeStyle = "rgba(255,255,255,.8)"; gg.lineWidth = 1;
        gg.beginPath(); gg.moveTo(-2.6, rr + 2); gg.lineTo(0, rr + 5.4); gg.lineTo(2.6, rr + 2); gg.stroke();
      });
    }
    // one bloom shared by the whole match
    {
      const mid = s.pt(0, 0);
      if (mid.z > 0.05) {
        const bloom = ge.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, R * 0.24);
        bloom.addColorStop(0, rgba(mix(hue, "#ffe9b0", 0.8), 0.55)); bloom.addColorStop(1, "rgba(0,0,0,0)");
        ge.fillStyle = bloom; ge.beginPath(); ge.arc(mid.x, mid.y, R * 0.24, 0, TAU); ge.fill();
      }
    }
    dust(p, 50, "rgba(255,240,248,.05)", "rgba(8,4,14,.08)");
  },

  /* tapdodge-engine — THE SPLIT-SPEED WORLD. Laminar velocity west, a real
     obstacle field east, one white-hot runner trace threading the gaps from
     start ring to checkered finish. */
  "tapdodge-engine": (p) => {
    const { g, ge, rnd, fbm, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.4);
    const SPLIT = -0.05;
    for (let i = 0; i < 16; i++) {
      const lat = -1.2 + (i / 15) * 2.4;
      g.strokeStyle = i % 3 === 0
        ? rgba(mix(hue, "#dff2ff", 0.5), 0.38)
        : rgba(mix(hue, "#9cc8e8", 0.4), 0.18);
      g.lineWidth = i % 3 === 0 ? 1.1 : 0.5;
      g.beginPath();
      const le = s.limbLon(lat);
      let started = false;
      for (let k = 0; k <= 30; k++) {
        const lon = s.lon0(lat) + (k / 30) * (Math.min(SPLIT, le) + le);
        const q = s.pt(lon, lat + (fbm(lon * 2 + i, lat * 4) - 0.5) * 0.02);
        if (q.z <= 0.03) { started = false; continue; }
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke();
    }
    for (let row = -4; row <= 4; row++) {
      for (let col = 0; col < 4; col++) {
        const lon = SPLIT + 0.18 + col * 0.3 + (row % 2 ? 0.15 : 0);
        const lat = row * 0.26;
        s.spot(g, lon, lat, (gg, f) => {
          const w = R * 0.075 * (0.7 + f * 0.35), h = R * 0.05;
          gg.fillStyle = `rgba(${18 + (row + col) % 2 * 14},${20 + (row + col) % 2 * 10},34,.8)`;
          gg.beginPath();
          gg.roundRect(-w / 2, -h / 2, w, h, 1.6); gg.fill();
          gg.strokeStyle = "rgba(200,225,250,.55)"; gg.lineWidth = 0.7; gg.stroke();
        });
      }
    }
    // the divide — a confident boundary
    g.strokeStyle = "rgba(240,250,255,.6)"; g.lineWidth = 1.4;
    g.beginPath(); s.meridian(g, SPLIT, -1.3, 1.3); g.stroke();
    const run: { x: number; y: number; z: number }[] = [];
    for (let k = 0; k <= 30; k++) {
      const u = k / 30;
      const lat = -1 + u * 2;
      const lon = SPLIT + 0.33 + Math.sin(u * 9.4) * 0.16 + u * 0.1;
      run.push(s.pt(lon, lat));
    }
    for (const [gc, wcol, lw] of [[g, "rgba(255,255,255,.9)", 1.2], [ge, "rgba(235,245,255,.85)", 1.7]] as const) {
      gc.strokeStyle = wcol; gc.lineWidth = lw; gc.lineJoin = "round";
      gc.beginPath();
      let started = false;
      for (const q of run) {
        if (q.z <= 0.04) { started = false; continue; }
        if (!started) { gc.moveTo(q.x, q.y); started = true; } else gc.lineTo(q.x, q.y);
      }
      gc.stroke();
    }
    const start = run[0], fin = run[30];
    if (start.z > 0.05) {
      g.strokeStyle = "rgba(160,240,200,.95)"; g.lineWidth = 1.4;
      g.beginPath(); g.arc(start.x, start.y, 4, 0, TAU); g.stroke();
      ge.strokeStyle = "rgba(170,245,210,.7)"; ge.lineWidth = 1.2;
      ge.beginPath(); ge.arc(start.x, start.y, 4, 0, TAU); ge.stroke();
    }
    if (fin.z > 0.05) {
      for (let ry = 0; ry < 2; ry++) for (let i = 0; i < 4; i++) {
        g.fillStyle = (i + ry) % 2 ? "rgba(255,255,255,.9)" : "rgba(10,10,16,.9)";
        g.fillRect(fin.x - 4.4 + i * 2.2, fin.y - 2.2 + ry * 2.2, 2.2, 2.2);
      }
      ge.fillStyle = "rgba(255,255,255,.75)";
      ge.beginPath(); ge.arc(fin.x, fin.y, 1.8, 0, TAU); ge.fill();
    }
    dust(p, 60, "rgba(220,240,255,.05)", "rgba(6,10,18,.08)");
  },

  /* evals-differential-oracle — THE TWIN VERDICT. Stipple west, striation
     east, one jagged seam — and the paired probes: rings that agree, and two
     amber mismatches wired across the divide. */
  "evals-differential-oracle": (p) => {
    const { g, ge, rnd, fbm, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.42);
    const seam = (lat: number) => 0.06 + (fbm(3.1, lat * 2.6) - 0.5) * 0.34;
    for (let i = 0; i < 240; i++) {
      const lat = (rnd() - 0.5) * 2.6, le = s.limbLon(lat);
      const lon = s.lon0(lat) + rnd() * (Math.min(seam(lat), le) + le);
      if (lon > seam(lat)) continue;
      const q = s.pt(lon, lat);
      if (q.z <= 0.04) continue;
      g.fillStyle = `rgba(${170 + Math.floor(rnd() * 40)},200,255,${0.16 + rnd() * 0.22})`;
      g.beginPath(); g.arc(q.x, q.y, (0.5 + rnd() * 0.9) * (0.5 + q.z * 0.6), 0, TAU); g.fill();
    }
    for (let i = 0; i < 80; i++) {
      const lat = (rnd() - 0.5) * 2.4, le = s.limbLon(lat);
      const l0 = seam(lat) + rnd() * Math.max(0.05, le - seam(lat));  // seam-relative: already surface space
      const q1 = s.pt(l0, lat), q2 = s.pt(l0 + 0.14 + rnd() * 0.1, lat + (rnd() - 0.5) * 0.05);
      if (q1.z <= 0.04 || q2.z <= 0.04 || l0 < seam(lat)) continue;
      g.strokeStyle = rgba(mix(hue, "#dcc2ff", 0.55), 0.36 + rnd() * 0.2); g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(q1.x, q1.y); g.lineTo(q2.x, q2.y); g.stroke();
    }
    for (const [gc, col, lw] of [[g, "rgba(255,255,255,.8)", 1.1], [ge, "rgba(240,244,255,.55)", 1.8]] as const) {
      gc.strokeStyle = col; gc.lineWidth = lw; gc.lineJoin = "round";
      gc.beginPath();
      let started = false;
      for (let k = 0; k <= 40; k++) {
        const lat = -1.35 + (k / 40) * 2.7;
        const q = s.pt(seam(lat), lat);
        if (q.z <= 0.03) { started = false; continue; }
        if (!started) { gc.moveTo(q.x, q.y); started = true; } else gc.lineTo(q.x, q.y);
      }
      gc.stroke();
    }
    const pairs: [number, boolean][] = [[-0.7, true], [-0.25, true], [0.15, false], [0.55, true], [0.95, false]];
    for (const [lat, agree] of pairs) {
      const off = 0.3;
      const a = s.pt(seam(lat) - off, lat), b = s.pt(seam(lat) + off, lat);
      if (a.z <= 0.05 || b.z <= 0.05) continue;
      const rr = R * 0.042;
      g.strokeStyle = agree ? "rgba(215,238,255,.8)" : "rgba(255,190,110,.95)"; g.lineWidth = 1.3;
      g.beginPath(); g.arc(a.x, a.y, rr, 0, TAU); g.stroke();
      if (agree) {
        g.beginPath(); g.arc(b.x, b.y, rr, 0, TAU); g.stroke();
      } else {
        g.beginPath(); g.moveTo(b.x - rr, b.y - rr); g.lineTo(b.x + rr, b.y + rr);
        g.moveTo(b.x + rr, b.y - rr); g.lineTo(b.x - rr, b.y + rr); g.stroke();
        g.strokeStyle = "rgba(255,190,110,.7)"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(a.x, a.y);
        g.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 7, b.x, b.y); g.stroke();
        ge.strokeStyle = "rgba(255,196,120,.55)"; ge.lineWidth = 1.1;
        ge.beginPath(); ge.moveTo(a.x, a.y);
        ge.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 7, b.x, b.y); ge.stroke();
        ge.fillStyle = "rgba(255,196,120,.85)";
        ge.beginPath(); ge.arc(b.x, b.y, 2.4, 0, TAU); ge.fill();
        ge.beginPath(); ge.arc(a.x, a.y, 1.8, 0, TAU); ge.fill();
      }
    }
    dust(p, 50, "rgba(230,240,255,.05)", "rgba(8,8,18,.08)");
  },

  /* cast-pipeline — THE PROJECTOR WORLD. A wide film-strip band — sprockets,
     five framed scenes, dividers — one frame burning bright under a real
     projection cone from the machine on the high latitude. */
  "cast-pipeline": (p) => {
    const { g, ge, rnd, fbm, rgba, mix, hue, R, TAU } = p;
    const s = sphere(p, 0.42);
    for (let i = 0; i < 6; i++) {
      const lat = -1.1 + (i / 5) * 2.2;
      g.strokeStyle = rgba(mix(hue, "#31234f", 0.5), 0.18 + rnd() * 0.1); g.lineWidth = 2.4 + rnd() * 2.6;
      g.beginPath(); s.latLine(g, lat, (lon) => (fbm(lon * 1.2 + i * 3.3, lat * 3) - 0.5) * 0.16); g.stroke();
    }
    // the film strip — widened to carry readable frames
    g.fillStyle = "rgba(8,6,14,.78)"; s.band(g, -0.34, 0.08); g.fill();
    g.strokeStyle = "rgba(232,238,252,.5)"; g.lineWidth = 0.8;
    g.beginPath(); s.latLine(g, -0.34); g.stroke();
    g.beginPath(); s.latLine(g, 0.08); g.stroke();
    for (const edge of [-0.295, 0.035]) {
      for (let k = -7; k <= 7; k++) {
        s.spot(g, k * 0.17, edge, (gg) => {
          gg.fillStyle = "rgba(228,236,250,.6)";
          gg.fillRect(-1.3, -1.3, 2.6, 2.6);
        });
      }
    }
    const scenes: ((gg: Ctx, r2: number) => void)[] = [
      (gg, r2) => { gg.beginPath(); gg.arc(0, 0, r2 * 0.4, 0, TAU); gg.stroke(); },
      (gg, r2) => { for (let i = -1; i <= 1; i++) { gg.beginPath(); gg.moveTo(i * r2 * 0.3, -r2 * 0.4); gg.lineTo(i * r2 * 0.3, r2 * 0.4); gg.stroke(); } },
      (gg, r2) => { gg.beginPath(); gg.moveTo(-r2 * 0.4, r2 * 0.3); gg.lineTo(-r2 * 0.1, -r2 * 0.3); gg.lineTo(r2 * 0.15, r2 * 0.1); gg.lineTo(r2 * 0.45, -r2 * 0.35); gg.stroke(); },
      (gg, r2) => { for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) { gg.beginPath(); gg.arc((a - 1.5) * r2 * 0.25, (b - 1) * r2 * 0.3, 0.6, 0, TAU); gg.fill(); } },
      (gg, r2) => { gg.beginPath(); gg.moveTo(-r2 * 0.4, -r2 * 0.4); gg.lineTo(r2 * 0.4, r2 * 0.4); gg.stroke(); },
    ];
    const LIT = 2;
    for (let f = 0; f < 5; f++) {
      const lon = -0.95 + f * 0.47;
      // bright dividers between frames
      if (f > 0) {
        g.strokeStyle = "rgba(210,220,244,.5)"; g.lineWidth = 0.9;
        g.beginPath(); s.meridian(g, lon - 0.235, -0.31, 0.05); g.stroke();
      }
      s.spot(g, lon, -0.13, (gg) => {
        const w = R * 0.115, h = R * 0.078;
        gg.fillStyle = f === LIT ? "rgba(255,250,235,.92)" : "rgba(32,30,52,.9)";
        gg.fillRect(-w / 2, -h / 2, w, h);
        gg.strokeStyle = "rgba(205,215,240,.5)"; gg.lineWidth = 0.5;
        gg.strokeRect(-w / 2, -h / 2, w, h);
        gg.strokeStyle = f === LIT ? "rgba(45,32,66,.85)" : "rgba(188,198,228,.6)";
        gg.fillStyle = gg.strokeStyle; gg.lineWidth = 0.8;
        scenes[f](gg, h);
      });
    }
    s.spot(ge, -0.95 + LIT * 0.47, -0.13, (gg) => {
      gg.fillStyle = "rgba(255,246,220,.9)";
      gg.fillRect(-R * 0.055, -R * 0.038, R * 0.11, R * 0.076);
    });
    // the projector — a machine you can SEE, throwing a real cone
    const proj = { lon: -0.95 + LIT * 0.47 - 0.28, lat: 0.78 };
    s.spot(g, proj.lon, proj.lat, (gg) => {
      gg.fillStyle = "rgba(235,240,252,.95)";
      gg.fillRect(-R * 0.05, -R * 0.03, R * 0.1, R * 0.06);
      gg.fillStyle = "rgba(120,130,160,.9)";
      gg.beginPath(); gg.arc(R * 0.058, 0, R * 0.024, 0, TAU); gg.fill();
      gg.fillStyle = "rgba(70,78,104,.9)";
      gg.beginPath(); gg.arc(-R * 0.02, -R * 0.045, R * 0.018, 0, TAU); gg.fill();
      gg.beginPath(); gg.arc(R * 0.022, -R * 0.045, R * 0.018, 0, TAU); gg.fill();
    });
    const a = s.pt(proj.lon, proj.lat), b = s.pt(-0.95 + LIT * 0.47, -0.13);
    if (a.z > 0.05 && b.z > 0.05) {
      const cone = g.createLinearGradient(a.x, a.y, b.x, b.y);
      cone.addColorStop(0, "rgba(255,250,230,.55)"); cone.addColorStop(1, "rgba(255,250,230,.08)");
      g.fillStyle = cone;
      g.beginPath(); g.moveTo(a.x, a.y);
      g.lineTo(b.x - R * 0.11, b.y - R * 0.026); g.lineTo(b.x + R * 0.11, b.y + R * 0.026);
      g.closePath(); g.fill();
      const gcone = ge.createLinearGradient(a.x, a.y, b.x, b.y);
      gcone.addColorStop(0, "rgba(255,248,225,.5)"); gcone.addColorStop(1, "rgba(255,248,225,.05)");
      ge.fillStyle = gcone;
      ge.beginPath(); ge.moveTo(a.x, a.y);
      ge.lineTo(b.x - R * 0.08, b.y - R * 0.02); ge.lineTo(b.x + R * 0.08, b.y + R * 0.02);
      ge.closePath(); ge.fill();
      ge.fillStyle = "rgba(255,248,225,.9)";
      ge.beginPath(); ge.arc(a.x + (b.x - a.x) * 0.05, a.y + (b.y - a.y) * 0.05, 2, 0, TAU); ge.fill();
      for (let i = 0; i < 8; i++) {
        const u = 0.15 + rnd() * 0.7;
        g.fillStyle = `rgba(255,250,235,${0.25 + rnd() * 0.3})`;
        g.beginPath();
        g.arc(a.x + (b.x - a.x) * u + (rnd() - 0.5) * 5, a.y + (b.y - a.y) * u + (rnd() - 0.5) * 4, 0.5 + rnd() * 0.6, 0, TAU);
        g.fill();
      }
    }
    dust(p, 60, "rgba(235,235,252,.05)", "rgba(8,6,16,.09)");
  },
};
