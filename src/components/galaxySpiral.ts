/* ════════════════════════════════════════════════════════════════════════════
   THE SPIRAL GALAXY, PURE — geometry for the v2 layout: ONE galaxy, five
   log-spiral arms winding from a shared core, differential rotation.

   The five taxonomy clusters are ARMS now, not separated ring systems: each
   winds outward along r(φ) = r0·e^(b·φ) from the same center, so the
   taxonomy survives as structure instead of distance. A project's seat on
   its arm is a SLOT — most-connected nearest the core, ordered by
   structural-edge degree then id, so the placement is deterministic under
   any input order — and operator-minted "founded" projects join the
   youngest arm's tail. Everything here is pure math, which is what makes
   the layout's contracts (deterministic placement, monotonic radius along
   an arm, label spacing at fit zoom, the rotation law, the t = 0 freeze)
   provable without a canvas.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The galactic center — the binary core's barycenter (constellation.ts
    anchors the sun/hole pair here) and the pole every arm winds from. */
export const GALAXY_CENTER = { x: 760, y: 170 } as const;

export const SPIRAL = {
  /** innermost slot radius — outside the binary core's corona zone */
  r0: 640,
  /** radial step per slot along an arm */
  dr: 255,
  /** Winding tightness: φ(r) = ln(r/r0)/b — smaller b = more open arms.
      0.7 is measured, not felt: open the arms much further and a long arm's
      early slots wind into the next arm's sector (the label pileup the
      spacing test pins); tighter and same-arm neighbours stack instead. */
  b: 0.7,
  /** the 2.5D inclination: world y squashed, as the old cluster rings were */
  squashY: 0.72,
} as const;

/** Differential rotation: Ω falls with radius, so the inner arms sweep
    faster. Subtle by design — the inner disc takes ~8 minutes a turn. */
export const ROTATION = { omega0: 0.02, rRef: 500 } as const;

export interface ArmDef {
  id: string;
  name: string;
  /** base angle of the arm's innermost slot */
  phase: number;
  /** caption font size at zoom 1 — the region name painted under the sky */
  cap: number;
}

// Phases are SEARCHED, not evenly spaced: arms carry very different loads
// (8 worlds down to 1), so even phases left the frozen pose vertically
// lopsided. These maximize the minimum pairwise seat distance subject to the
// pose spanning the frame both ways — measured, like the winding.
export const ARMS: ArmDef[] = [
  { id: "grading", name: "grading core", phase: 0, cap: 110 },
  { id: "harness", name: "harness & agents", phase: 3.99, cap: 96 },
  { id: "runtime", name: "runtimes", phase: 0.88, cap: 90 },
  { id: "studio", name: "studio", phase: 5.15, cap: 80 },
  { id: "vac", name: "verifiable evaluation", phase: 1.81, cap: 100 },
];

/** Operator-minted projects have no arm of their own — they ride the tail
    of the YOUNGEST arm (the suite era), still labeled as their own kind. */
export const FOUNDED = { id: "founded", name: "founded", cap: 80 } as const;
export const YOUNGEST_ARM = "vac";

// Seed projects by arm; anything unlisted is "founded" and joins the
// youngest arm's tail at runtime.
export const CLUSTER_OF: Record<string, string> = {
  gradecore: "grading", crashkit: "grading", "model-drift": "grading", "rag-eval-lab": "grading",
  "eval-history": "grading", "eval-dashboard": "grading", "prompt-regress": "grading", "pi-eval": "grading",
  "agentic-dev-harness": "harness", "pi-gates": "harness", "harness-builder": "harness",
  "agent-graph": "harness", "mcp-tools": "harness", "llm-gateway": "harness",
  "tapdodge-engine": "runtime", "match3-engine": "runtime", "evals-differential-oracle": "runtime",
  "cast-pipeline": "studio",
  "vac-protocol": "vac", "agent-certlab": "vac", "reference-fleet": "vac",
  evalmut: "vac", "vac-gate": "vac",
};

export const clusterName = (id: string): string =>
  ARMS.find((a) => a.id === id)?.name ?? FOUNDED.name;

/** Slot k's galactocentric radius — strictly increasing in k, which is the
    whole monotonicity contract: further down an arm is further out. */
export const slotRadius = (k: number) => SPIRAL.r0 + k * SPIRAL.dr;

/** The arm's angle where it crosses radius r — the log-spiral inverted. */
export const armAngleAt = (phase: number, r: number) => phase + Math.log(r / SPIRAL.r0) / SPIRAL.b;

/** Ω(r): strictly positive, strictly falling with radius. */
export const rotSpeed = (r: number) => ROTATION.omega0 / (1 + r / ROTATION.rRef);

/** Where a base angle has swept to after t seconds. The sweep is NEGATIVE —
    against the winding — so the arms TRAIL the rotation the way a spiral
    galaxy's do; t = 0 is the frozen pose the mount paint and
    prefers-reduced-motion both draw. */
export const rotatedAngle = (r: number, a0: number, t: number) => a0 - rotSpeed(r) * t;

/** World position of galactocentric polar (r, a0) after t seconds of
    differential rotation, in the squashed 2.5D plane. */
export const spiralPos = (r: number, a0: number, t: number) => {
  const a = rotatedAngle(r, a0, t);
  return {
    x: GALAXY_CENTER.x + Math.cos(a) * r,
    y: GALAXY_CENTER.y + Math.sin(a) * r * SPIRAL.squashY,
  };
};

/** Slot k on an arm, at the frozen pose. Fractional slots are legal — the
    wormhole doors park between and beyond the integer seats. */
export const armSlot = (armId: string, k: number) => {
  const arm = ARMS.find((a) => a.id === armId);
  if (!arm) throw new Error(`no arm: ${armId}`);
  const r = slotRadius(k);
  const a = armAngleAt(arm.phase, r);
  return { r, a, ...spiralPos(r, a, 0) };
};

export interface ArmSeat {
  id: string;
  /** structural-edge degree — the placement's first sort key */
  degree: number;
}

export interface Placement {
  id: string;
  armId: string;
  /** taxonomy id for copy ("founded" projects ride the vac arm but keep
      their own name) */
  clusterId: string;
  slot: number;
  r: number;
  a: number;
  x: number;
  y: number;
}

/** Every project gets a seat: an arm's own members ordered degree-desc (id
    breaks ties), founded projects appended to the youngest arm AFTER its
    members, in the same order among themselves. The sort is total, so the
    input order never matters — same members in, same galaxy out. */
export function placeOnArms(members: ArmSeat[]): Map<string, Placement> {
  const byArm = new Map<string, { seat: ArmSeat; clusterId: string; founded: boolean }[]>();
  ARMS.forEach((a) => byArm.set(a.id, []));
  members.forEach((m) => {
    const clusterId = CLUSTER_OF[m.id] ?? FOUNDED.id;
    const founded = clusterId === FOUNDED.id;
    byArm.get(founded ? YOUNGEST_ARM : clusterId)!.push({ seat: m, clusterId, founded });
  });
  const out = new Map<string, Placement>();
  byArm.forEach((list, armId) => {
    list.sort(
      (p, q) =>
        Number(p.founded) - Number(q.founded) || // the tail is the tail
        q.seat.degree - p.seat.degree ||
        (p.seat.id < q.seat.id ? -1 : 1)
    );
    list.forEach((entry, slot) => {
      const s = armSlot(armId, slot);
      out.set(entry.seat.id, { id: entry.seat.id, armId, clusterId: entry.clusterId, slot, ...s });
    });
  });
  return out;
}
