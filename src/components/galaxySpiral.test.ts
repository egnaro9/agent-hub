import { describe, it, expect } from "vitest";
import { STRUCTURAL } from "../data/mock";
import {
  ARMS,
  CLUSTER_OF,
  FOUNDED,
  GALAXY_CENTER,
  SPIRAL,
  YOUNGEST_ARM,
  armAngleAt,
  placeOnArms,
  rotSpeed,
  rotatedAngle,
  slotRadius,
  spiralPos,
} from "./galaxySpiral";
import { BINARY_R, BLACK_HOLE, SUN, WORMHOLES } from "./constellation";
import { FIT_Z, projectMap, solveMapFit, type FitBody } from "./galaxyFit";

// The spiral layout's contracts, provable without a canvas: the same members
// always land in the same seats, an arm only ever runs outward, the disc
// sweeps one way with the inside fastest, and the fitted home view keeps the
// labels legible.

const degreeOf = (id: string) =>
  STRUCTURAL.filter((e) => e.source === id || e.target === id).length;
const seeds = () => Object.keys(CLUSTER_OF).map((id) => ({ id, degree: degreeOf(id) }));

// ---- placement: deterministic, degree-then-id, founded on the tail ----------

describe("placeOnArms", () => {
  it("is deterministic under any input order — same members in, same galaxy out", () => {
    const a = placeOnArms(seeds());
    const b = placeOnArms([...seeds()].reverse());
    expect(a.size).toBe(b.size);
    a.forEach((pl, id) => expect(b.get(id)).toEqual(pl));
  });

  it("seats every seeded project exactly once, on its own cluster's arm", () => {
    const placed = placeOnArms(seeds());
    expect(placed.size).toBe(Object.keys(CLUSTER_OF).length);
    placed.forEach((pl, id) => {
      expect(pl.armId).toBe(CLUSTER_OF[id]);
      expect(pl.clusterId).toBe(CLUSTER_OF[id]);
    });
  });

  it("orders an arm by structural degree, id breaking ties — most-connected nearest the core", () => {
    const placed = placeOnArms(seeds());
    ARMS.forEach((arm) => {
      const members = [...placed.values()].filter((pl) => pl.armId === arm.id);
      const want = [...members]
        .sort((p, q) => degreeOf(q.id) - degreeOf(p.id) || (p.id < q.id ? -1 : 1))
        .map((pl) => pl.id);
      const got = [...members].sort((p, q) => p.slot - q.slot).map((pl) => pl.id);
      expect(got).toEqual(want);
    });
  });

  it("founded projects join the youngest arm's tail, after every native member", () => {
    const placed = placeOnArms([...seeds(), { id: "minted-later", degree: 9 }]);
    const minted = placed.get("minted-later")!;
    expect(minted.armId).toBe(YOUNGEST_ARM);
    expect(minted.clusterId).toBe(FOUNDED.id);
    const natives = [...placed.values()].filter(
      (pl) => pl.armId === YOUNGEST_ARM && pl.clusterId !== FOUNDED.id
    );
    // degree 9 would beat every native — the tail still holds
    natives.forEach((pl) => expect(minted.slot).toBeGreaterThan(pl.slot));
  });
});

// ---- the arms only run outward ----------------------------------------------

describe("arm geometry", () => {
  it("radius grows strictly monotonically along every arm", () => {
    const placed = placeOnArms(seeds());
    ARMS.forEach((arm) => {
      const rs = [...placed.values()]
        .filter((pl) => pl.armId === arm.id)
        .sort((p, q) => p.slot - q.slot)
        .map((pl) => pl.r);
      for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThan(rs[i - 1]);
    });
  });

  it("every seat sits on its arm's own log spiral", () => {
    const placed = placeOnArms(seeds());
    placed.forEach((pl) => {
      const arm = ARMS.find((a) => a.id === pl.armId)!;
      expect(pl.r).toBe(slotRadius(pl.slot));
      expect(pl.a).toBeCloseTo(armAngleAt(arm.phase, pl.r), 10);
      const p0 = spiralPos(pl.r, pl.a, 0);
      expect(pl.x).toBeCloseTo(p0.x, 10);
      expect(pl.y).toBeCloseTo(p0.y, 10);
    });
  });

  it("the wormhole doors sit at the rim — beyond every planet on their arm", () => {
    const placed = placeOnArms(seeds());
    WORMHOLES.forEach((w) => {
      [...placed.values()]
        .filter((pl) => pl.armId === w.arm)
        .forEach((pl) => expect(w.rG).toBeGreaterThan(pl.r));
    });
  });
});

// ---- differential rotation: one way, inside fastest, frozen at t = 0 --------

describe("differential rotation", () => {
  it("angular speed is positive and strictly falls with radius", () => {
    expect(rotSpeed(1500)).toBeGreaterThan(0);
    expect(rotSpeed(320)).toBeGreaterThan(rotSpeed(700));
    expect(rotSpeed(700)).toBeGreaterThan(rotSpeed(1500));
  });

  it("the disc sweeps ONE way — angles only ever decrease with time", () => {
    for (const r of [320, 800, 1600]) {
      expect(rotatedAngle(r, 1, 5)).toBeLessThan(1);
      expect(rotatedAngle(r, 1, 9)).toBeLessThan(rotatedAngle(r, 1, 5));
    }
  });

  it("the inner disc outruns the outer — the sweep that trails the arms", () => {
    const swept = (r: number) => 1 - rotatedAngle(r, 1, 10);
    expect(swept(320)).toBeGreaterThan(swept(800));
    expect(swept(800)).toBeGreaterThan(swept(1600));
  });

  it("t = 0 is the frozen pose — no motion leaks into the mount paint", () => {
    for (const r of [320, 800, 1600]) {
      expect(rotatedAngle(r, 2.2, 0)).toBe(2.2);
      expect(spiralPos(r, 2.2, 0)).toEqual(spiralPos(r, 2.2, 0));
    }
    // and time genuinely moves it, so the freeze is a choice, not a stub
    expect(spiralPos(500, 2.2, 4)).not.toEqual(spiralPos(500, 2.2, 0));
  });
});

// ---- label spacing at the fitted home view ----------------------------------

// The fit reserves each world's whole swept circle (rotation-invariant), so
// this mirrors GalaxyCanvas's fitMap: concentric annulus bodies for planets,
// the binary's full orbit, the doors at the rim. 130 world px stands in for
// the largest sprite reserve the live map ever adds.
function fitBodies() {
  const placed = placeOnArms(seeds());
  const bodies: FitBody[] = [];
  placed.forEach((pl) => {
    bodies.push({
      x: GALAXY_CENTER.x,
      y: GALAXY_CENTER.y,
      p: 0.98,
      rx: pl.r + 130,
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
  WORMHOLES.forEach((w) =>
    bodies.push({ x: w.x, y: w.y, rx: w.r * 1.7, ry: w.r * 1.2, p: 1, centroid: false })
  );
  return { placed, bodies };
}

describe("label spacing at fit zoom", () => {
  // the verifier's wide canvas — the frame most operators actually get
  const W = 1148, H = 856;
  const { placed, bodies } = fitBodies();
  const cam = solveMapFit(bodies, W, H, { x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, z: 0.4 });

  it("the fitted home view lifts off the zoom floor", () => {
    expect(cam.z).toBeGreaterThan(FIT_Z.min);
  });

  it("no two worlds land close enough to pile their labels up", () => {
    const pts = [...placed.values()].map((pl) => projectMap(cam, W, H, pl.x, pl.y, 0.98));
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        min = Math.min(min, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    // Calibrated against the approved cluster-ring layout, whose fitted view
    // measured a 54px floor: the spiral may not regress below the same order.
    expect(min).toBeGreaterThan(48);
  });

  it("the doors stay clear of every world at fit zoom too", () => {
    const pts = [...placed.values()].map((pl) => projectMap(cam, W, H, pl.x, pl.y, 0.98));
    WORMHOLES.forEach((w) => {
      const [wx, wy] = projectMap(cam, W, H, w.x, w.y, 1);
      pts.forEach(([px, py]) => expect(Math.hypot(px - wx, py - wy)).toBeGreaterThan(55));
    });
  });
});
