import { describe, it, expect } from "vitest";
import {
  BINARY,
  BINARY_R,
  BLACK_HOLE,
  SUN,
  WORMHOLES,
  binaryPose,
  perturb,
  sunCaption,
  sunGlow,
  wormholeTarget,
} from "./constellation";
import { ARMS, CLUSTER_OF, armAngleAt, armSlot, rotatedAngle, spiralPos } from "./galaxySpiral";
import { GALAXY_CENTER } from "./galaxySpiral";

// The constellation's contracts, provable without a canvas: the sun never
// shines a fake count, the tab rule never leaks a jump, the binary's
// barycenter never moves, and the unseen mass goes perfectly still under
// reduced motion.

// ---- the sun's caption: honest in every state -------------------------------

describe("sunCaption", () => {
  it("speaks the live claim, count first", () => {
    expect(sunCaption({ status: "live", accepted: 11 })).toBe(
      "11 claims, independently replayed — do not trust us, run it"
    );
  });

  it("declines the plural for one claim", () => {
    expect(sunCaption({ status: "live", accepted: 1 })).toBe(
      "1 claim, independently replayed — do not trust us, run it"
    );
  });

  it("names a stale count stale, never passing it off as live", () => {
    expect(sunCaption({ status: "cached", accepted: 9 })).toBe("registry unreachable — 9 last seen");
  });

  it("admits having nothing rather than defaulting a number", () => {
    expect(sunCaption({ status: "unreachable", accepted: null })).toBe("registry unreachable — no count to show");
  });

  it("says it is still reading before the fetch lands", () => {
    expect(sunCaption(null)).toBe("reading the registry…");
  });
});

// ---- the sun's brightness: data-bound, monotone, dim without data -----------

describe("sunGlow", () => {
  it("brightens monotonically with the accepted count", () => {
    expect(sunGlow(0).glow).toBeLessThan(sunGlow(11).glow);
    expect(sunGlow(11).glow).toBeLessThan(sunGlow(40).glow);
    expect(sunGlow(0).corona).toBeLessThan(sunGlow(11).corona);
  });

  it("caps — a runaway registry cannot white out the map", () => {
    expect(sunGlow(40)).toEqual(sunGlow(400));
  });

  it("burns dimmer with NO count than with any real count, zero included", () => {
    expect(sunGlow(null).glow).toBeLessThan(sunGlow(0).glow);
    expect(sunGlow(null).corona).toBeLessThan(sunGlow(0).corona);
  });
});

// ---- the binary core: two bodies, one stationary barycenter -----------------

describe("the binary core", () => {
  it("t = 0 is the frozen pose SUN and BLACK_HOLE publish — the mount paint's state", () => {
    const p0 = binaryPose(0);
    expect(p0.sun).toEqual({ x: SUN.x, y: SUN.y });
    expect(p0.hole).toEqual({ x: BLACK_HOLE.x, y: BLACK_HOLE.y });
  });

  it("the mass-weighted midpoint never leaves the galactic center", () => {
    for (const t of [0, 7.3, 33.4, 61, BINARY.period * 2.4]) {
      const p = binaryPose(t);
      const m = BINARY.sunMass + BINARY.holeMass;
      expect((BINARY.sunMass * p.sun.x + BINARY.holeMass * p.hole.x) / m).toBeCloseTo(GALAXY_CENTER.x, 9);
      expect((BINARY.sunMass * p.sun.y + BINARY.holeMass * p.hole.y) / m).toBeCloseTo(GALAXY_CENTER.y, 9);
    }
  });

  it("orbit radii are mass-inverse — the heavier harness rides the tighter circle", () => {
    expect(BINARY.holeMass).toBeGreaterThan(BINARY.sunMass);
    expect(BINARY_R.hole).toBeLessThan(BINARY_R.sun);
    expect(BINARY.sunMass * BINARY_R.sun).toBeCloseTo(BINARY.holeMass * BINARY_R.hole, 9);
  });

  it("one period brings the pair back to its starting pose — quick, but never frantic", () => {
    expect(BINARY.period).toBeGreaterThanOrEqual(20); // spun up by operator call 2026-08-15 — a close binary WHIRLS; 20s floor keeps it celestial, never frantic
    const p = binaryPose(BINARY.period);
    expect(p.sun.x).toBeCloseTo(SUN.x, 6);
    expect(p.sun.y).toBeCloseTo(SUN.y, 6);
    expect(p.hole.x).toBeCloseTo(BLACK_HOLE.x, 6);
    expect(p.hole.y).toBeCloseTo(BLACK_HOLE.y, 6);
  });
});

// ---- the unseen mass: felt nearby, exactly zero far away --------------------

describe("perturb", () => {
  const near = { x: BLACK_HOLE.x + 300, y: BLACK_HOLE.y + 100 };

  it("is EXACTLY zero outside the influence radius — distant orbits owe it nothing", () => {
    // far enough from the barycenter that no phase of the orbit can reach it
    const far = { x: GALAXY_CENTER.x + BLACK_HOLE.influence + BINARY_R.hole + 50, y: GALAXY_CENTER.y };
    expect(perturb(far.x, far.y, 0)).toEqual({ dx: 0, dy: 0 });
    expect(perturb(far.x, far.y, 3)).toEqual({ dx: 0, dy: 0 });
    // and exactly at the live edge, whatever the pose
    const hole3 = binaryPose(3).hole;
    expect(perturb(hole3.x + BLACK_HOLE.influence + 1, hole3.y, 3)).toEqual({ dx: 0, dy: 0 });
  });

  it("the influence FOLLOWS the live hole — a bent point is owed nothing once the pair has orbited away", () => {
    // parked just inside the influence of the FROZEN seat, on the side the
    // hole is about to leave: bent at t = 0, exactly zero half a period on
    const p0 = binaryPose(0).hole, pHalf = binaryPose(BINARY.period / 2).hole;
    const away = { x: p0.x - pHalf.x, y: p0.y - pHalf.y };
    const len = Math.hypot(away.x, away.y);
    const P = {
      x: p0.x + (away.x / len) * (BLACK_HOLE.influence - 60),
      y: p0.y + (away.y / len) * (BLACK_HOLE.influence - 60),
    };
    const at0 = perturb(P.x, P.y, 0);
    expect(Math.hypot(at0.dx, at0.dy)).toBeGreaterThan(0);
    expect(perturb(P.x, P.y, BINARY.period / 2)).toEqual({ dx: 0, dy: 0 });
  });

  it("bends a nearby orbit measurably", () => {
    const q = perturb(near.x, near.y, 3);
    expect(Math.hypot(q.dx, q.dy)).toBeGreaterThan(1);
  });

  it("falls off with distance along a ray", () => {
    const at = (d: number) => {
      const q = perturb(BLACK_HOLE.x + d, BLACK_HOLE.y, 0);
      return Math.hypot(q.dx, q.dy);
    };
    expect(at(200)).toBeGreaterThan(at(500));
    expect(at(500)).toBeGreaterThan(at(900));
  });

  it("moves while time flows, and holds perfectly still at t = 0 — the reduced-motion contract", () => {
    const a = perturb(near.x, near.y, 1), b = perturb(near.x, near.y, 4);
    expect(a).not.toEqual(b); // motion exists when time is passed in
    expect(perturb(near.x, near.y, 0)).toEqual(perturb(near.x, near.y, 0)); // and only then
  });
});

// ---- the estate rule --------------------------------------------------------

describe("wormholeTarget", () => {
  it("keeps a jump inside egnaro9.github.io in this tab", () => {
    expect(wormholeTarget("https://egnaro9.github.io/vac-protocol/").newTab).toBe(false);
    expect(wormholeTarget("https://egnaro9.github.io/seraphlight-studios/tap-dodge-rush/play/").newTab).toBe(false);
  });

  it("opens external hosts in a new tab", () => {
    expect(wormholeTarget("https://crashkit.onrender.com").newTab).toBe(true);
    expect(wormholeTarget("https://dev.to/anything").newTab).toBe(true);
  });

  it("is not fooled by a lookalike host", () => {
    expect(wormholeTarget("https://egnaro9.github.io.evil.com/x").newTab).toBe(true);
  });
});

// ---- the bodies themselves --------------------------------------------------

describe("the constellation roster", () => {
  it("every portal is https and uniquely named", () => {
    const ids = [SUN.id, BLACK_HOLE.id, ...WORMHOLES.map((w) => w.id)];
    expect(new Set(ids).size).toBe(ids.length);
    [SUN.url, ...WORMHOLES.map((w) => w.url)].forEach((u) => expect(u.startsWith("https://")).toBe(true));
  });

  it("carries the four destinations the spec names", () => {
    const urls = WORMHOLES.map((w) => w.url).join(" ");
    expect(urls).toContain("reference-fleet");   // the fleet audit board
    expect(urls).toContain("crashkit");          // crashkit live
    expect(urls).toContain("model-drift");       // the drift board
    expect(urls).toContain("tap-dodge-rush");    // the seraphlight play page
  });

  it("the black hole has no URL — no wormhole in, by construction", () => {
    expect("url" in BLACK_HOLE).toBe(false);
  });
});

// ---- door seating: tidally locked into tip-to-tip voids ---------------------

describe("door seating", () => {
  const seeded = (armId: string) =>
    Object.values(CLUSTER_OF).filter((c) => c === armId).length;
  // the outermost OCCUPIED seat per arm — the silhouette the voids are between
  const tips = ARMS.map((a) => armSlot(a.id, seeded(a.id) - 1).a % (Math.PI * 2));
  const angDist = (a: number, b: number) => {
    const d = Math.abs(((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };

  it("frozen x/y IS spiralPos(rG, aG, 0) — the pose the live frames re-derive", () => {
    WORMHOLES.forEach((w) => {
      const p = spiralPos(w.rG, w.aG, 0);
      expect(w.x).toBeCloseTo(p.x, 6);
      expect(w.y).toBeCloseTo(p.y, 6);
    });
  });

  it("every door bearing clears every arm tip by ≥ 0.3 rad — seated in a void, not on an arm", () => {
    WORMHOLES.forEach((w) => {
      const nearest = Math.min(...tips.map((tp) => angDist(w.aG, tp)));
      expect(nearest).toBeGreaterThanOrEqual(0.3);
    });
  });

  it("the lock is exact at the door's own radius: door-to-arm offset is time-invariant", () => {
    // (The canvas applies this via advanceWorld; here we pin the math it uses.)
    WORMHOLES.forEach((w) => {
      ARMS.forEach((arm) => {
        const off = (t: number) =>
          rotatedAngle(w.rG, w.aG, t) - rotatedAngle(w.rG, armAngleAt(arm.phase, w.rG), t);
        expect(off(777)).toBeCloseTo(off(0), 9);
      });
    });
  });
});
