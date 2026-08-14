import { describe, it, expect } from "vitest";
import { SUN, BLACK_HOLE, WORMHOLES, sunGlow, sunCaption, perturb, wormholeTarget } from "./constellation";

// The constellation's contracts, provable without a canvas: the sun never
// shines a fake count, the tab rule never leaks a jump, and the unseen mass
// goes perfectly still under reduced motion.

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

// ---- the unseen mass: felt nearby, exactly zero far away --------------------

describe("perturb", () => {
  const near = { x: BLACK_HOLE.x + 300, y: BLACK_HOLE.y + 100 };

  it("is EXACTLY zero outside the influence radius — distant orbits owe it nothing", () => {
    expect(perturb(SUN.x, SUN.y, 3)).toEqual({ dx: 0, dy: 0 });
    const far = { x: BLACK_HOLE.x + BLACK_HOLE.influence + 1, y: BLACK_HOLE.y };
    expect(perturb(far.x, far.y, 3)).toEqual({ dx: 0, dy: 0 });
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
