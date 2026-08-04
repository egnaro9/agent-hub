import type { Vec } from "../types";

// The layered-network arrange: agents as a vertical center column, projects
// fanned into layer columns either side — the LLM-architecture-diagram look.
// Pure function of the graph, so it can be unit-tested without a canvas: same
// input, same constellation, every time. Nothing in here may call Math.random
// or read a clock; determinism IS the contract (and there is a test for it).

// Node footprints, taken from the components rather than invented here:
// ProjectNode is `w-[196px]` with a padded two-line card under it; AgentNode is
// `w-[164px]` with a 64px avatar + name + status chip + button row stacked.
// Heights are ceilings of what those stacks render at, because the layout's
// no-overlap promise is only as honest as the box it assumes.
export const PROJECT_W = 196;
export const PROJECT_H = 120;
export const AGENT_W = 164;
export const AGENT_H = 170;

// Air. The horizontal gaps are wide on purpose — the work edges have to READ
// as lines crossing a gap, not as smudges between touching cards.
const COLUMN_GAP = 120; // agent column edge → first layer's near edge
const LAYER_GAP = 110; // between layer columns on the same side
const PROJECT_PITCH = PROJECT_H + 42; // vertical rhythm of a layer column
const AGENT_PITCH = AGENT_H + 26; // vertical rhythm of the center column

// A layer column takes this many cards before the side grows another layer.
// 18 projects → 9 a side → 2 layers (5+4); 30 → 15 a side → 3 layers (5+5+5).
// Growing layers instead of stretching columns is what keeps the shape a FAN
// rather than two skyscrapers.
const MAX_ROWS = 5;

interface HasId {
  id: string;
}
interface EdgeLike {
  source: string;
  target: string;
}

const byId = (a: HasId, b: HasId) => a.id.localeCompare(b.id);

/**
 * Compute a full constellation: every agent and every project gets a top-left
 * position (React Flow's coordinate convention). The rules, in priority order:
 *
 *  1. Assignment decides side — a worked project (and its whole cluster) is
 *     placed first, so it lands in the innermost layer where its work edge to
 *     the center column is shortest.
 *  2. Structural clusters stay adjacent — connected components of the
 *     structural graph go to ONE side as a block, so "grades"/"same suite"
 *     chains never straddle the column.
 *  3. Alphabetical only as the final tiebreak.
 *
 * Agents are ordered by the vertical middle of the projects they work, so a
 * work edge drops roughly straight sideways instead of slicing the whole map.
 */
export function arrangeLayout(
  agents: readonly HasId[],
  projects: readonly HasId[],
  structural: readonly EdgeLike[],
  assignments: Readonly<Record<string, string>>
): Record<string, Vec> {
  // Sort copies up front so the CALLER's array order can never leak into the
  // result — determinism must hold across "same graph, different insert order".
  const projectList = [...projects].sort(byId);
  const agentList = [...agents].sort(byId);
  const projectIds = new Set(projectList.map((p) => p.id));
  const worked = new Set(Object.values(assignments).filter((pid) => projectIds.has(pid)));

  // --- clusters: connected components over the structural edges -------------
  // Plain union-find. Edges that mention a non-project (or an id not on the
  // board) are ignored rather than crashing — the mock data is curated, but an
  // operator-minted project can be renamed out from under an edge.
  const parent = new Map<string, string>(projectList.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // path compression, so a long chain doesn't make this quadratic
    let c = x;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const e of structural) {
    if (!projectIds.has(e.source) || !projectIds.has(e.target)) continue;
    const a = find(e.source);
    const b = find(e.target);
    // Deterministic union: the alphabetically-smaller root wins, so the
    // component's representative doesn't depend on edge order.
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const clusters = new Map<string, string[]>();
  for (const p of projectList) {
    const root = find(p.id);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(p.id);
  }

  // Inside a cluster: worked projects first (rule 1 — they take the innermost
  // slots), then alphabetical (rule 3). The members are already alpha-sorted
  // because projectList was.
  const clusterList = Array.from(clusters.values(), (members) => {
    const ordered = [...members.filter((m) => worked.has(m)), ...members.filter((m) => !worked.has(m))];
    return { members: ordered, worked: ordered.some((m) => worked.has(m)), key: members[0] };
  });
  // Placement order: worked clusters first (so their projects reach layer 1),
  // then bigger clusters (they need contiguous room), then the alpha key.
  clusterList.sort(
    (a, b) =>
      Number(b.worked) - Number(a.worked) || b.members.length - a.members.length || a.key.localeCompare(b.key)
  );

  // --- sides: greedy balance, cluster-atomic --------------------------------
  // A cluster goes wholly to whichever side currently holds fewer projects
  // (tie → left). Atomic placement is rule 2: a cluster may make the sides
  // uneven, but it may never be cut in half to even them.
  const left: string[] = [];
  const right: string[] = [];
  for (const c of clusterList) (left.length <= right.length ? left : right).push(...c.members);

  const pos: Record<string, Vec> = {};
  const centerY = new Map<string, number>(); // project id → center y, for the agent ordering

  // --- project fans ---------------------------------------------------------
  // Slots fill column-major: layer 1 top-to-bottom, then layer 2, … so the
  // placement order above (worked → clustered → alpha) maps straight onto
  // "innermost first, contiguous blocks". Each layer column is vertically
  // centered on y=0, which is what makes the fan read as deliberate rather
  // than as a spreadsheet.
  const placeSide = (ids: string[], sign: 1 | -1) => {
    if (ids.length === 0) return;
    const layers = Math.max(1, Math.ceil(ids.length / MAX_ROWS));
    const rows = Math.ceil(ids.length / layers); // balanced: 9 → 5+4, not 5+4+0
    for (let i = 0; i < ids.length; i++) {
      const layer = Math.floor(i / rows);
      const row = i % rows;
      const inColumn = Math.min(rows, ids.length - layer * rows);
      const cx = sign * (AGENT_W / 2 + COLUMN_GAP + PROJECT_W / 2 + layer * (PROJECT_W + LAYER_GAP));
      const cy = (row - (inColumn - 1) / 2) * PROJECT_PITCH;
      pos[ids[i]] = { x: cx - PROJECT_W / 2, y: cy - PROJECT_H / 2 };
      centerY.set(ids[i], cy);
    }
  };
  placeSide(left, -1);
  placeSide(right, 1);

  // --- the center column ----------------------------------------------------
  // An agent is pulled toward the vertical middle of the project it works, so
  // its work edge crosses the gap at a shallow angle instead of spanning the
  // whole column. Idle agents have no pull and sit by the center; alpha breaks
  // every tie so two idle agents land in a stable order.
  const pull = (a: HasId): number => {
    const target = assignments[a.id];
    return target !== undefined && centerY.has(target) ? centerY.get(target)! : 0;
  };
  const orderedAgents = [...agentList].sort((a, b) => pull(a) - pull(b) || a.id.localeCompare(b.id));
  for (let i = 0; i < orderedAgents.length; i++) {
    const cy = (i - (orderedAgents.length - 1) / 2) * AGENT_PITCH;
    pos[orderedAgents[i].id] = { x: -AGENT_W / 2, y: cy - AGENT_H / 2 };
  }

  return pos;
}
