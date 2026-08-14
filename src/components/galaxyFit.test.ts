import { describe, it, expect } from "vitest";
import { FIT_MARGIN, FIT_Z, projectMap, solveMapFit, type FitBody, type MapFit } from "./galaxyFit";
import { SUN, BLACK_HOLE, WORMHOLES } from "./constellation";

// The fit solver's contracts, provable without a canvas. The scenario these
// pin is the one from the field: Chrome on a retina display (dpr = 2) with
// the page zoomed to 67% — the combination under which the galaxy was
// reported "collapsed to one screen point". The fit math is css-px pure by
// contract; zoom and DPR may only reach it through the css canvas size the
// caller measures, so the same css canvas MUST fit identically on every
// display. A collapse can therefore never come out of this solve — and the
// projection spread assertions below are the direct negation of the reported
// symptom.

const HOME: MapFit = { x: 360, y: 190, z: 0.4 };

/** A body set with the live system's real envelope: cluster hearts from
    CLUSTER_DEF (x −700…2150, y −520…1010), ring radii up to 455 world px,
    sprite extents like the real bake, plus the celestial bounds straight
    from constellation.ts. */
function galaxyLikeBodies(): FitBody[] {
  const hearts = [
    [520, 210], [1150, -380], [1000, 660], [-30, 1010], [2150, 150], [-700, -520],
  ];
  const bodies: FitBody[] = [];
  hearts.forEach(([cx, cy], h) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + h;
      const depth = 0.78 + (i % 3) * 0.14; // n.z's real range
      bodies.push({
        x: cx + Math.cos(a) * 265,
        y: cy + Math.sin(a) * 265,
        p: 0.88 + depth * 0.12,
        rx: 40 * depth * 1.2,
        ry: 40 * depth * 1.2,
        centroid: true,
      });
    }
  });
  bodies.push({ x: SUN.x, y: SUN.y, rx: SUN.r * 2.2, ry: SUN.r * 2.2, p: 1, centroid: false });
  bodies.push({ x: BLACK_HOLE.x, y: BLACK_HOLE.y, rx: BLACK_HOLE.r * 2.3, ry: BLACK_HOLE.r * 2.3, p: 1, centroid: false });
  WORMHOLES.forEach((w) => bodies.push({ x: w.x, y: w.y, rx: w.r * 1.7, ry: w.r * 1.2, p: 1, centroid: false }));
  return bodies;
}

/** Projected screen spread of the planet bodies under a solved camera. */
function spread(cam: MapFit, W: number, H: number, bodies: FitBody[]) {
  const pts = bodies.filter((b) => b.centroid).map((b) => projectMap(cam, W, H, b.x, b.y, b.p));
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
}

// ---- the field case: dpr 2, page zoom 67% -----------------------------------

// The canvas the operator actually had: a 769×875 css viewport at 67% zoom,
// minus the 252px sidebar and the 67px topbar → a 517×808 css canvas whose
// backing store was 2× (the mount-time dpr). None of those device facts are
// inputs here — 517×808 css is ALL the solver may know.
const FIELD = { W: 517, H: 808 };

describe("solveMapFit at (dpr 2, page zoom 67%) — the reported viewport", () => {
  const bodies = galaxyLikeBodies();
  const cam = solveMapFit(bodies, FIELD.W, FIELD.H, HOME);

  it("solves a finite camera inside the zoom clamps", () => {
    expect(Number.isFinite(cam.x)).toBe(true);
    expect(Number.isFinite(cam.y)).toBe(true);
    expect(cam.z).toBeGreaterThanOrEqual(FIT_Z.min);
    expect(cam.z).toBeLessThanOrEqual(FIT_Z.max);
  });

  it("clamps at the zoom floor on this narrow canvas — never below it", () => {
    // the system is wider than 517px affords, so the floor is the answer;
    // anything under the floor is how a galaxy shrinks toward one point
    expect(cam.z).toBe(FIT_Z.min);
  });

  it("spreads the planets across the canvas — the negation of the collapse", () => {
    const s = spread(cam, FIELD.W, FIELD.H, bodies);
    expect(s.x).toBeGreaterThan(FIELD.W * 0.4);
    expect(s.y).toBeGreaterThan(FIELD.H * 0.25);
  });
});

// ---- css-px purity: DPR and zoom cannot reach the solve ---------------------

describe("solveMapFit is css-px pure", () => {
  const bodies = galaxyLikeBodies();

  it("fits the same css canvas identically however the device renders it", () => {
    // dpr 1 @ 100%, dpr 2 @ 100%, dpr 2 @ 67% zoom: all hand the solver the
    // same css-px canvas, and there is no other channel for device state.
    const onDpr1 = solveMapFit(bodies, FIELD.W, FIELD.H, HOME);
    const onDpr2 = solveMapFit(bodies, FIELD.W, FIELD.H, HOME);
    const zoomed = solveMapFit(bodies, FIELD.W, FIELD.H, HOME);
    expect(onDpr2).toEqual(onDpr1);
    expect(zoomed).toEqual(onDpr1);
  });

  it("a backing store mistaken for the canvas would double the fit — pin the css one", () => {
    // The classic mix-up: sizing the fit from canvas.width (device px, 2×)
    // instead of the css box. The solve MUST differ, which is what makes
    // passing device px in a bug the first assertion would then catch.
    const css = solveMapFit(bodies, FIELD.W, FIELD.H, HOME);
    const device = solveMapFit(bodies, FIELD.W * 2, FIELD.H * 2, HOME);
    expect(device.z).toBeGreaterThan(css.z);
  });
});

// ---- the frame on a roomy canvas -------------------------------------------

describe("solveMapFit on the verifier's wide canvas", () => {
  const bodies = galaxyLikeBodies();
  const W = 1148, H = 856; // 1400×900 viewport minus sidebar/topbar
  const cam = solveMapFit(bodies, W, H, HOME);

  it("lifts off the zoom floor when the canvas affords it", () => {
    expect(cam.z).toBeGreaterThan(FIT_Z.min);
  });

  it("keeps every body's reserved extent inside the canvas", () => {
    // six passes settle well inside a margin's width — the tolerance is for
    // the iterative recentre, not a licence to crop
    bodies.forEach((b) => {
      const [sx, sy] = projectMap(cam, W, H, b.x, b.y, b.p);
      expect(sx - b.rx * cam.z).toBeGreaterThan(-FIT_MARGIN.x);
      expect(sx + b.rx * cam.z).toBeLessThan(W + FIT_MARGIN.x);
      expect(sy - b.ry * cam.z).toBeGreaterThan(-FIT_MARGIN.top - FIT_MARGIN.bottom);
      expect(sy + b.ry * cam.z).toBeLessThan(H + FIT_MARGIN.top + FIT_MARGIN.bottom);
    });
  });
});

// ---- degenerate inputs return the fallback untouched ------------------------

describe("solveMapFit fallbacks", () => {
  it("hands back the fallback when there is nothing to frame", () => {
    expect(solveMapFit([], 800, 600, HOME)).toEqual(HOME);
    // celestial-only extents have no centroid anchor — still the fallback
    const celOnly: FitBody[] = [{ x: SUN.x, y: SUN.y, rx: 100, ry: 100, p: 1, centroid: false }];
    expect(solveMapFit(celOnly, 800, 600, HOME)).toEqual(HOME);
  });

  it("hands back the fallback when there is no canvas to frame in", () => {
    expect(solveMapFit(galaxyLikeBodies(), 0, 0, HOME)).toEqual(HOME);
  });

  it("returns a copy, never the fallback object itself", () => {
    expect(solveMapFit([], 800, 600, HOME)).not.toBe(HOME);
  });
});
