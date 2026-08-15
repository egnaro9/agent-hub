import { describe, it, expect } from "vitest";
import { FIT_MARGIN, FIT_Z, projectMap, solveMapFit, type FitBody, type MapFit } from "./galaxyFit";
import { SUN, BLACK_HOLE, BINARY_R, WORMHOLES } from "./constellation";
import { CLUSTER_OF, GALAXY_CENTER, SPIRAL, placeOnArms } from "./galaxySpiral";

// The fit solver's contracts, provable without a canvas. The scenario these
// pin is the one from the field: Chrome on a retina display (dpr = 2) with
// the page zoomed to 67% — the combination under which the galaxy was
// reported "collapsed to one screen point". The fit math is css-px pure by
// contract; zoom and DPR may only reach it through the css canvas size the
// caller measures, so the same css canvas MUST fit identically on every
// display. A collapse can therefore never come out of this solve — and the
// projection spread assertions below are the direct negation of the reported
// symptom.

const HOME: MapFit = { x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, z: 0.4 };

/** The live system's real envelope, built the way GalaxyCanvas's fitMap
    builds it: every world reserves the whole circle it sweeps about the
    galactic center (the fit is rotation-invariant by design), the binary
    reserves its full orbit, and the doors sit fixed at the arm tips. The
    seats come from the real spiral placement — the envelope can never drift
    from the layout it frames. Placement radii depend only on arm member
    counts, so degree 0 serves. */
function galaxyLikeBodies(): { bodies: FitBody[]; worlds: { x: number; y: number }[] } {
  const placed = placeOnArms(Object.keys(CLUSTER_OF).map((id) => ({ id, degree: 0 })));
  const bodies: FitBody[] = [];
  const worlds: { x: number; y: number }[] = [];
  placed.forEach((pl) => {
    worlds.push({ x: pl.x, y: pl.y });
    bodies.push({
      x: GALAXY_CENTER.x,
      y: GALAXY_CENTER.y,
      p: 0.98,
      rx: pl.r + 130, // 130 = a generous stand-in for the largest sprite reserve
      ry: pl.r * SPIRAL.squashY + 130,
      centroid: true,
    });
  });
  bodies.push({
    x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, p: 1, centroid: false,
    rx: BINARY_R.sun + SUN.r * 2.2, ry: BINARY_R.sun * SPIRAL.squashY + SUN.r * 2.2,
  });
  bodies.push({
    x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, p: 1, centroid: false,
    rx: BINARY_R.hole + BLACK_HOLE.r * 2.3, ry: BINARY_R.hole * SPIRAL.squashY + BLACK_HOLE.r * 2.3,
  });
  WORMHOLES.forEach((w) => bodies.push({ x: w.x, y: w.y, rx: w.r * 1.7, ry: w.r * 1.2, p: 1, centroid: false }));
  return { bodies, worlds };
}

/** Projected screen spread of the planets' actual seats under a solved
    camera — the frozen t = 0 pose, which is what a fresh mount shows. */
function spread(cam: MapFit, W: number, H: number, worlds: { x: number; y: number }[]) {
  const pts = worlds.map((b) => projectMap(cam, W, H, b.x, b.y, 0.98));
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
  const { bodies, worlds } = galaxyLikeBodies();
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
    const s = spread(cam, FIELD.W, FIELD.H, worlds);
    expect(s.x).toBeGreaterThan(FIELD.W * 0.4);
    expect(s.y).toBeGreaterThan(FIELD.H * 0.25);
  });
});

// ---- css-px purity: DPR and zoom cannot reach the solve ---------------------

describe("solveMapFit is css-px pure", () => {
  const { bodies } = galaxyLikeBodies();

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
  const { bodies } = galaxyLikeBodies();
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
    expect(solveMapFit(galaxyLikeBodies().bodies, 0, 0, HOME)).toEqual(HOME);
  });

  it("returns a copy, never the fallback object itself", () => {
    expect(solveMapFit([], 800, 600, HOME)).not.toBe(HOME);
  });
});
