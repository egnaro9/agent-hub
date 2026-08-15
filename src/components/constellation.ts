import type { RegistryCount } from "../data/registry";
import { ARMS, CLUSTER_OF, GALAXY_CENTER, SPIRAL, armSlot, spiralPos } from "./galaxySpiral";

/* ════════════════════════════════════════════════════════════════════════════
   THE CONSTELLATION LAYER — the three kinds of body that are NOT planets.

   THE SUN and THE BLACK HOLE are a TIGHT BINARY at the galactic center: the
   evidence registry (visible, data-bound) and the harness (effects only)
   orbiting their common barycenter, slowly. Everything else orbits the pair
   of public evidence and private machinery.

   THE SUN is the evidence registry. Its brightness is DATA-BOUND: the
   corona scales with the registry's live accepted-claim count, so the sun's
   luminosity is itself a verifiable claim. Clicking it is the one central
   wormhole — the live registry page.

   THE BLACK HOLE is the harness. It is rendered ONLY by its effects —
   lensing, accretion, and the perturbed orbits of nearby worlds, all
   following its LIVE position — because that is the posture as physics: its
   existence is inferred from the motion of everything else. No wormhole in,
   no room, no name beyond "the harness".

   WORMHOLES are portals to destinations best experienced where they run —
   ring-and-aperture, never a disc, labeled with where they go. They park at
   the outer tips of their arms: the doors out at the galaxy's edge. A jump
   inside the egnaro9.github.io estate stays in this tab; external hosts
   open a new one.

   Everything here is pure data and pure math, so the cosmology's contracts
   (honest captions, data-bound glow, the stationary barycenter, the frozen
   t = 0 pose under reduced motion, the tab rule) are provable without a
   canvas.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The binary core. The pair rides one squashed orbit in opposite phases,
    radii mass-inverse about the shared barycenter — so the mass-weighted
    midpoint sits exactly on the galactic center at every t. */
export const BINARY = {
  center: GALAXY_CENTER,
  /** seconds per orbit — spun up (operator call): a close binary WHIRLS,
      and the pair's hurry against the disc's calm is the impressive part */
  period: 34,
  /** the pose at t = 0 — the frozen state the mount paint draws */
  theta0: -0.8,
  sunMass: 1,
  holeMass: 1.7,
  /** separation between the two bodies, world px */
  sep: 300,
} as const;

const dSun = (BINARY.sep * BINARY.holeMass) / (BINARY.sunMass + BINARY.holeMass);
const dHole = (BINARY.sep * BINARY.sunMass) / (BINARY.sunMass + BINARY.holeMass);
/** Orbit radii about the barycenter — the heavier body rides the tighter
    circle. The fit reserves center ± these, so the whole orbit stays framed. */
export const BINARY_R = { sun: dSun, hole: dHole } as const;

/** The pair's pose at time t. Time is a parameter, not a read: t = 0 is the
    frozen pose (SUN and BLACK_HOLE below are exactly binaryPose(0)), which
    is what the mount paint and prefers-reduced-motion both draw. */
export const binaryPose = (t: number): { sun: { x: number; y: number }; hole: { x: number; y: number } } => {
  const th = BINARY.theta0 - ((Math.PI * 2) / BINARY.period) * t;
  const ux = Math.cos(th), uy = Math.sin(th) * SPIRAL.squashY;
  return {
    sun: { x: BINARY.center.x + ux * dSun, y: BINARY.center.y + uy * dSun },
    hole: { x: BINARY.center.x - ux * dHole, y: BINARY.center.y - uy * dHole },
  };
};

const POSE0 = binaryPose(0);

/** The visible half of the binary. x/y are its FROZEN (t = 0) seat — the
    live position is binaryPose(t).sun. */
export const SUN = {
  id: "sun-registry",
  name: "the registry",
  x: POSE0.sun.x,
  y: POSE0.sun.y,
  r: 100,
  url: "https://egnaro9.github.io/vac-protocol/",
} as const;

/** The unseen half. x/y are its frozen seat — the live position is
    binaryPose(t).hole. `influence` is the radius (world px) around that
    LIVE position inside which orbits visibly bend. */
export const BLACK_HOLE = {
  id: "the-harness",
  x: POSE0.hole.x,
  y: POSE0.hole.y,
  r: 88,
  influence: 950,
} as const;

export interface Wormhole {
  id: string;
  name: string;
  /** One line, in the voice of the destination's own shipped claims. */
  claim: string;
  url: string;
  x: number;
  y: number;
  r: number;
  hue: string;
  /** the arm whose tip this door continues */
  arm: string;
  /** galactocentric radius — provably beyond every planet on its arm */
  rG: number;
  /** galactocentric bearing at t = 0 — the door's seat in a tip-to-tip void */
  aG: number;
}

const seededOn = (armId: string) => Object.values(CLUSTER_OF).filter((c) => c === armId).length;

/** Doors ring the galaxy's open water: each parks on a shared rim just past
    the outermost world, in a VOID between arm tips rather than continuing
    any one arm — four exits around the whole disc. TIDALLY LOCKED: each door
    rides the disc's differential rotation at its own radius, so the bearing
    chosen into a tip-to-tip void stays in that void as the galaxy turns —
    outside the galaxy, but bound to its shape. (Cross-radius shear against
    the tips themselves is ~0.03 rad/min — a geologic drift, not a visible
    one.) x/y here are the frozen t = 0 pose — the reduced-motion frame and
    the mount paint; live frames re-derive from (rG, aG) like every world. */
const RIM = (() => {
  let rMax = 0;
  for (const armId of ARMS.map((a) => a.id))
    rMax = Math.max(rMax, armSlot(armId, seededOn(armId)).r);
  return rMax + 155;
})();
const door = (bearing: number, reach = 1) => ({
  ...spiralPos(RIM * reach, bearing, 0),
  arm: "rim", rG: RIM * reach, aG: bearing,
});

// The doors out, each at the tip of the arm whose story it continues; every
// URL here is the same live destination its project's world already links to.
export const WORMHOLES: Wormhole[] = [
  {
    id: "wh-fleet-audit",
    name: "fleet audit board",
    claim: "the naive suite caught 1 of 6 — live, CI-replayed",
    url: "https://egnaro9.github.io/reference-fleet/",
    ...door(5.95, 0.8), r: 96, hue: "#f97316",
  },
  {
    id: "wh-crashkit",
    name: "crashkit",
    claim: "adversarial crash-tests, BYOK, deterministic graders",
    url: "https://crashkit.onrender.com",
    ...door(0.75), r: 96, hue: "#fb7185",
  },
  {
    id: "wh-drift-board",
    name: "model-drift board",
    claim: "16 LLMs watched daily on a frozen suite",
    url: "https://egnaro9.github.io/model-drift/",
    ...door(2.54), r: 96, hue: "#2dd4bf",
  },
  {
    id: "wh-seraphlight",
    name: "tap dodge rush",
    claim: "one engine, two runtimes, diffed — playable here",
    url: "https://egnaro9.github.io/seraphlight-studios/tap-dodge-rush/play/",
    ...door(4.16, 0.84), r: 96, hue: "#60a5fa",
  },
];

/** The estate rule (operator-tightened 2026-08-15): the estate is ONE
    continuous space — any of his own properties navigates IN THIS TAB, and
    only genuinely external hosts get the shared out-tab. Exact-host or
    host-plus-slash matching, so a lookalike (crashkit.onrender.com.evil.com)
    never passes as estate. */
const ESTATE_HOSTS = [
  "https://egnaro9.github.io",
  "https://agent-hub-exiz.onrender.com",
  "https://crashkit.onrender.com",
];
export const wormholeTarget = (url: string): { newTab: boolean } => ({
  newTab: !ESTATE_HOSTS.some((h) => url === h || url.startsWith(h + "/")),
});

/**
 * Luminosity from the accepted-claim count — monotone, capped, and DIMMER
 * than any real count when there is no count at all. A sun that shone at
 * full strength over an unreachable registry would be the map lying.
 */
export const sunGlow = (accepted: number | null): { glow: number; corona: number } => {
  if (accepted === null) return { glow: 0.42, corona: 1.45 };
  const k = Math.min(accepted, 40) / 40;
  return { glow: 0.62 + 0.38 * k, corona: 1.7 + 1.1 * k };
};

/** The sun's hover line. Never a fake count: live gets the claim, a stale
    count is NAMED stale, and no count at all says exactly that. */
export const sunCaption = (reg: RegistryCount | null): string => {
  if (reg === null) return "reading the registry…";
  if (reg.status === "live" && reg.accepted !== null)
    return `${reg.accepted} claim${reg.accepted === 1 ? "" : "s"}, independently replayed — do not trust us, run it`;
  if (reg.accepted !== null) return `registry unreachable — ${reg.accepted} last seen`;
  return "registry unreachable — no count to show";
};

/**
 * The orbital perturbation the unseen mass leaves on a nearby body: mostly
 * tangential (an orbit disturbed), a little radial (a pull), falling off with
 * the square of closeness and EXACTLY zero outside the influence radius —
 * measured from the hole's LIVE position, so the disturbance sweeps the disc
 * with the binary. Time is a parameter, not a read — under
 * prefers-reduced-motion the caller passes t = 0 and the field degrades to a
 * static displacement around the frozen pose: the nearby orbits still sit
 * visibly bent, they just stop swaying.
 */
export const perturb = (x: number, y: number, t: number): { dx: number; dy: number } => {
  const hole = binaryPose(t).hole;
  const dx = x - hole.x, dy = y - hole.y;
  const d = Math.hypot(dx, dy);
  if (d >= BLACK_HOLE.influence || d < 1) return { dx: 0, dy: 0 };
  const w = (1 - d / BLACK_HOLE.influence) ** 2;
  const amp = 26 * w;
  const ux = dx / d, uy = dy / d;
  const ph = t * 0.16 + d * 0.011;
  const tang = Math.sin(ph) * amp;
  const rad = -amp * (0.35 + 0.25 * Math.cos(ph * 0.7));
  return { dx: -uy * tang + ux * rad, dy: ux * tang + uy * rad };
};
