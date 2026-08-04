import { create } from "zustand";

// The 2.5D orrery's one shared dial. Tilt is a constant — the resting pitch of
// the table — and yaw is the only thing that moves, so this store holds the
// yaw, the flat escape hatch, and nothing else. High-frequency consumers (the
// stage wrapper, the HUD strip's aria-valuenow) subscribe IMPERATIVELY and
// write a CSS variable / attribute, so a spinning field costs zero React
// renders; only the flat toggle — a once-in-a-session flip — goes through
// hooks.

/**
 * Resting pitch of the field. Chosen from the low end of the readable band
 * (8–14°) ON PURPOSE: at 10° the cards keep cos(10°) ≈ 98.5% of their height,
 * which is why they do NOT need a counter-tilt — only the yaw is counter-
 * rotated, and a rotateZ is a flat 2D transform the browser can invert exactly
 * even though React Flow's viewport flattens 3D. A counter-tilt through that
 * flattening would DOUBLE the squash instead of undoing it.
 */
export const TILT_DEG = 10;

/**
 * THE YAW CAP. React Flow converts pointer gestures to graph coordinates in
 * untransformed screen space, so a node drag under yaw θ lands rotated by θ
 * from where the hand went. Clicks are safe at any angle (the browser hit-
 * tests through the transform), but drags aren't — the miss is sin(θ)·drag,
 * CROSS-track, not the cos(θ) along-track projection an earlier comment here
 * sold as "96%, imperceptible": at ±16° a 200px drag lands ~67px off target
 * (measured; sin(16°)·200 ≈ 55px of that is pure sideways error, and the
 * 0.88 pullback shortens the landing on top). That is why HubCanvas eases
 * the yaw to 0 on drag start and restores it on release — every drag runs on
 * a flat field, so the cap no longer serves drag accuracy at all. It remains
 * as the READABILITY bound on the ambient sway, and the e2e hit-test gate
 * still proves clicks at both extremes. Raising it means re-running that
 * gate first.
 */
export const YAW_MAX_DEG = 16;

/**
 * Pull-back at full yaw. Rotating a rectangle inside a fixed window pushes its
 * corners out of frame — at max yaw the top-corner cards were sliding under
 * the MissionControl bar and clipping. So the stage recedes as it swings:
 * scale runs 1 → (1 − PULLBACK) linearly with |yaw|, which keeps every card's
 * centre on visible glass at ±16° (verified empirically by the e2e sweep at
 * the suite's 1280×720) and reads as the table breathing away from you.
 */
export const YAW_PULLBACK = 0.12;

/** The scale the stage should carry at a given yaw — one formula, one place. */
export const scaleForYaw = (deg: number) => 1 - (Math.abs(deg) / YAW_MAX_DEG) * YAW_PULLBACK;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Stage oversize — how far the stage rect outgrows the visible window on each
 * axis (1.14 ⇒ 114% wide/tall, ±7% overhang). DERIVED, then MEASURED:
 * cos(YAW_MAX°)/(1 − YAW_PULLBACK) ≈ 1.093 is the in-plane cost of keeping a
 * window edge on painted plane at full yaw — the perpendicular distance from
 * centre to a stage edge survives rotation, and the pullback divides it —
 * and the +0.05 pad buys back what the rotateX(10°) tilt plus the 1400px
 * perspective shave off the far edge. The binding case is the REST pose on
 * big windows, because the perspective length is absolute: at 110% the top
 * edge falls short of a 2560×1440 window at yaw 0 (modelled ~17px); at 114%
 * an elementFromPoint sweep finds ZERO uncovered edge points at rest from
 * 1280×720 through 2560×1440. At the ±16° extremes, transient dot-grid-only
 * slivers open near the leading corners — measured ≤80px deep at 720p and
 * ≤202px at 2560×1440, vs 52px/148px for the old 130%×124% on the same
 * sweep, so the artifact class is not new — and they are invisible on glass
 * (0.14-alpha dots under the scrim + vignette; screenshot-checked at max
 * yaw). TRUE full-sweep coverage would take a ≥160% stage (modelled), which
 * is exactly the raster bill this constant exists to cut: 114% paints ~19%
 * fewer stage pixels per 3d frame than 130%×124% did.
 */
export const STAGE_OVERSIZE =
  Math.round((Math.cos(rad(YAW_MAX_DEG)) / (1 - YAW_PULLBACK) + 0.05) * 100) / 100;

/** The visual breathing room a fit leaves around content, in WINDOW terms. */
export const FIT_PADDING = 0.12;

/**
 * The padding to hand React Flow so a fit lands content in the visible
 * WINDOW, not the oversized stage. RF's pane IS the stage, and its numeric
 * padding p makes fitted content occupy 1/(1+p) of the pane per axis
 * (@xyflow/system parsePadding: each side gets (v − v/(1+p))/2). Solving
 * content = window/(1 + FIT_PADDING) with pane = STAGE_OVERSIZE·window gives
 * p = (1 + FIT_PADDING)·STAGE_OVERSIZE − 1 — same constant that sizes the
 * stage, so the two cannot drift apart. Before this, fitting the 130%×124%
 * stage after an arrange hung the agent column 66px off-glass.
 */
export const stageFitPadding = (flat: boolean) =>
  flat ? FIT_PADDING : (1 + FIT_PADDING) * STAGE_OVERSIZE - 1;

/** Idle drift rate — degrees per MINUTE. Ambient, not an animation you watch. */
export const DRIFT_DEG_PER_MIN = 5;

/** How long the pointer must be idle (and off the field) before drift resumes. */
export const DRIFT_IDLE_MS = 4000;

/**
 * The one pointer ledger for the whole field. It lives HERE and not inside
 * HubCanvas because the HUD is a SIBLING surface: with the tracker on the
 * canvas wrapper alone, parking the cursor on a HUD button read as "pointer
 * gone" and the field resumed its sway behind the very control being aimed
 * at. A plain module object, not store state — it changes on every
 * pointermove, and nothing should ever render because of it; the drift loop
 * and the star canvas read it when THEY decide to.
 */
export const fieldPointer = { overCanvas: false, overHud: false, lastActive: 0 };
export const markFieldActive = () => {
  fieldPointer.lastActive = performance.now();
};

const FLAT_KEY = "agent-hub:orrery-flat";
const loadFlat = (): boolean => {
  try {
    return localStorage.getItem(FLAT_KEY) === "1";
  } catch {
    return false;
  }
};

interface OrreryState {
  /** Current yaw in degrees, always inside ±YAW_MAX_DEG. */
  yaw: number;
  /** True while the HUD strip is being dragged — the drift loop yields. */
  dragging: boolean;
  /**
   * When the hand last touched the dial (strip release, arrow key). Drift
   * waits DRIFT_IDLE_MS past this too — a field that starts crawling the
   * instant you let go of the dial reads as the dial fighting you.
   */
  manualAt: number;
  /** The old view, one click away: no perspective, no transform, no scrim. */
  flat: boolean;
  setYaw: (deg: number) => void;
  setDragging: (v: boolean) => void;
  markManual: () => void;
  toggleFlat: () => void;
}

export const clampYaw = (deg: number) => Math.max(-YAW_MAX_DEG, Math.min(YAW_MAX_DEG, deg));

export const useOrrery = create<OrreryState>()((set) => ({
  yaw: 0,
  dragging: false,
  manualAt: 0,
  flat: loadFlat(),
  setYaw: (deg) => set({ yaw: clampYaw(deg) }),
  setDragging: (v) => set({ dragging: v, manualAt: performance.now() }),
  markManual: () => set({ manualAt: performance.now() }),
  toggleFlat: () =>
    set((s) => {
      const flat = !s.flat;
      try {
        localStorage.setItem(FLAT_KEY, flat ? "1" : "0");
      } catch {
        /* private mode — the choice just doesn't persist */
      }
      // Flat must return TODAY'S exact rendering, and today's rendering has no
      // yaw — so the pose zeroes rather than freezing mid-sway.
      return { flat, yaw: 0 };
    }),
}));

/**
 * The counter-rotation every card applies so its text stays flat to camera
 * while the field sways under it. A CSS variable, not React state: the stage
 * wrapper writes `--hub-yaw` once per frame and every descendant's transform
 * updates on the compositor, with zero renders. The 0deg fallback makes the
 * same string safe anywhere outside the stage.
 */
export const COUNTER_YAW = "rotateZ(calc(var(--hub-yaw, 0deg) * -1))";
