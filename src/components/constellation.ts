import type { RegistryCount } from "../data/registry";

/* ════════════════════════════════════════════════════════════════════════════
   THE CONSTELLATION LAYER — the three kinds of body that are NOT planets.

   THE SUN is the evidence registry. Everything orbits it because every
   project's claims are bound to it, and its brightness is DATA-BOUND: the
   corona scales with the registry's live accepted-claim count, so the sun's
   luminosity is itself a verifiable claim. Clicking it is the one central
   wormhole — the live registry page.

   THE BLACK HOLE is the harness. It is rendered ONLY by its effects —
   lensing, accretion, and the perturbed orbits of nearby worlds — because
   that is the posture as physics: its existence is inferred from the motion
   of everything else. No wormhole in, no room, no name beyond "the harness".

   WORMHOLES are portals to destinations best experienced where they run —
   ring-and-aperture, never a disc, labeled with where they go. A jump inside
   the egnaro9.github.io estate stays in this tab; external hosts open a new
   one.

   Everything here is pure data and pure math, so the cosmology's contracts
   (honest captions, data-bound glow, motionless perturbation under reduced
   motion, the tab rule) are provable without a canvas.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The sun sits on the vac cluster's heart — layout() leaves that seat empty
    so the suite worlds ride their ring around the registry itself. */
export const SUN = {
  id: "sun-registry",
  name: "the registry",
  x: 2150,
  y: 150,
  r: 68,
  url: "https://egnaro9.github.io/vac-protocol/",
} as const;

/** Placed off the harness cluster's shoulder, in the dark. `influence` is the
    radius (world px) inside which orbits visibly bend. */
export const BLACK_HOLE = {
  id: "the-harness",
  x: 1580,
  y: -760,
  r: 46,
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
}

// Each portal parks near the region whose story it continues; every URL here
// is the same live destination its project's world already links to.
export const WORMHOLES: Wormhole[] = [
  {
    id: "wh-fleet-audit",
    name: "fleet audit board",
    claim: "the naive suite caught 1 of 6 — live, CI-replayed",
    url: "https://egnaro9.github.io/reference-fleet/",
    x: 2620, y: -140, r: 19, hue: "#f97316",
  },
  {
    id: "wh-crashkit",
    name: "crashkit",
    claim: "adversarial crash-tests, BYOK, deterministic graders",
    url: "https://crashkit.onrender.com",
    x: -560, y: 390, r: 19, hue: "#fb7185",
  },
  {
    id: "wh-drift-board",
    name: "model-drift board",
    claim: "16 LLMs watched daily on a frozen suite",
    url: "https://egnaro9.github.io/model-drift/",
    x: -470, y: -290, r: 19, hue: "#2dd4bf",
  },
  {
    id: "wh-seraphlight",
    name: "tap dodge rush",
    claim: "one engine, two runtimes, diffed — playable here",
    url: "https://egnaro9.github.io/seraphlight-studios/tap-dodge-rush/play/",
    x: 1160, y: 1060, r: 19, hue: "#60a5fa",
  },
];

/** The estate rule: a jump that never leaves his name stays in this tab;
    anything external opens a new one. The trailing slash matters — without it
    a lookalike host (egnaro9.github.io.evil.com) would pass as estate. */
export const wormholeTarget = (url: string): { newTab: boolean } => ({
  newTab: !url.startsWith("https://egnaro9.github.io/"),
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
 * the square of closeness and EXACTLY zero outside the influence radius.
 * Time is a parameter, not a read — under prefers-reduced-motion the caller
 * passes t = 0 and the field degrades to a static displacement: the orbits
 * still sit visibly off their rings, they just stop swaying.
 */
export const perturb = (x: number, y: number, t: number): { dx: number; dy: number } => {
  const dx = x - BLACK_HOLE.x, dy = y - BLACK_HOLE.y;
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
