/* ════════════════════════════════════════════════════════════════════════════
   THE 2.5D FIT SOLVER, PURE. Extracted from GalaxyCanvas so the math that
   frames the whole system is provable without a canvas.

   UNITS ARE CSS PIXELS, END TO END. The solver never sees devicePixelRatio
   or browser page zoom, and that is the contract, not an accident: zoom and
   DPR may only change the css size of the canvas the CALLER measures (W, H)
   and the backing-store scale the renderer applies at its context transform.
   The day either sneaks in here — an extent divided by a zoom, a margin in
   device px — the same viewport fits differently on different displays,
   which is exactly the class of bug the unit tests on this file pin against.

   The solve is iterative because planets ride a parallax factor: each
   recentring changes every node's effective offset, so centre and zoom are
   re-derived together until they settle (six passes, same as the live map).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FitBody {
  /** world position */
  x: number;
  y: number;
  /** world-unit half-extents to reserve (a ring is wide, a corona is round) */
  rx: number;
  ry: number;
  /** parallax factor — planets ride 0.88 + depth·0.12, celestial bodies 1 */
  p: number;
  /** planets anchor the starting centroid; celestial extents only bound the frame */
  centroid: boolean;
}

export interface MapFit {
  x: number;
  y: number;
  z: number;
}

/** Frame margins in css px — labels hang below; the HUD owns the bottom-right. */
export const FIT_MARGIN = { x: 74, top: 58, bottom: 104 };
/** The camera's zoom clamps — one journey's worth of range. */
export const FIT_Z = { min: 0.2, max: 3.1 };

/**
 * Solve the camera that frames every body inside a W×H css-px canvas.
 * Returns the fallback untouched when there is nothing to frame or no canvas
 * to frame it in.
 */
export function solveMapFit(bodies: FitBody[], W: number, H: number, fallback: MapFit): MapFit {
  const anchors = bodies.filter((b) => b.centroid);
  if (anchors.length === 0 || W === 0) return { ...fallback };
  let cx = 0,
    cy = 0;
  anchors.forEach((b) => {
    cx += b.x;
    cy += b.y;
  });
  cx /= anchors.length;
  cy /= anchors.length;
  let z = fallback.z;
  for (let pass = 0; pass < 6; pass++) {
    let uMin = Infinity,
      uMax = -Infinity,
      vMin = Infinity,
      vMax = -Infinity;
    bodies.forEach((b) => {
      const u = b.x - cx * b.p,
        v = b.y - cy * b.p;
      uMin = Math.min(uMin, u - b.rx);
      uMax = Math.max(uMax, u + b.rx);
      vMin = Math.min(vMin, v - b.ry);
      vMax = Math.max(vMax, v + b.ry);
    });
    const availW = Math.max(140, W - FIT_MARGIN.x * 2);
    const availH = Math.max(140, H - FIT_MARGIN.top - FIT_MARGIN.bottom);
    z = Math.max(
      FIT_Z.min,
      Math.min(FIT_Z.max, Math.min(availW / Math.max(1, uMax - uMin), availH / Math.max(1, vMax - vMin)))
    );
    // land the content's midpoint on the viewport's optical centre
    const wantV = (FIT_MARGIN.top - FIT_MARGIN.bottom) / (2 * z);
    cx += (uMin + uMax) / 2 / 0.94;
    cy += ((vMin + vMax) / 2 - wantV) / 0.94;
  }
  return { x: cx, y: cy, z };
}

/**
 * Where a world point lands on screen under a camera — the same projection
 * the canvas painters and the DOM labels use (GalaxyCanvas's w2s).
 */
export const projectMap = (
  cam: MapFit,
  W: number,
  H: number,
  x: number,
  y: number,
  p = 1
): [number, number] => [(x - cam.x * p) * cam.z + W / 2, (y - cam.y * p) * cam.z + H / 2];
