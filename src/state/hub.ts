import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Agent, Conversation, Message, MessageNode, Project, QueuedLine, StructuralEdge, Vec } from "../types";
import { PRESETS, briefFor, callCount, plan, type Phase, type Topology, type TopologyNode } from "../agents/topology";
import { getShape, toTopology, validateShape } from "../agents/customShapes";
import { appendJournal } from "./journal";
import type { RunExportV1, RunExportNode } from "./runExport";
import { getOverride } from "../agents/roster";
import { getGenConfig, getRouting } from "../agents/brain";
import { AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS } from "../data/mock";
import { personaFor, ERRORS, buildRoundtable, nextId } from "../sim/lines";
import {
  fetchHubBranches,
  fetchOpenIssues,
  fetchRecentCommits,
  fetchRepoTree,
  type BranchEntry,
  type IssueEntry,
  type RepoFeed,
  type TreeEntry,
} from "../data/github";
import { getKey, buildAgentSystem, toTurns, streamReply, runToolLoop, readRepoFile, GATED_TOOLS, toolsFor, currentFile, commitToBranch, getGhToken, modelForAgent } from "../agents/brain";
import { detailFor } from "../data/detail";

export type Stage = { kind: "graph" } | { kind: "project"; id: string };
export type ProjectMode = "overview" | "work";

/** One turn's deviation from the room's normal streaming — used by topology runs. */
export interface TurnBrief {
  /** Prepended to this node's system prompt for this one turn. */
  brief?: string;
  /** Stamped onto the message this turn writes, so the transcript stays legible. */
  node?: MessageNode;
  /** Where this turn adds up what it actually cost. Only a shape run passes one. */
  spend?: RunSpend;
}

// The spend used to be a RANGE, and the range was this file admitting it could
// not see: the store only observes `execute`, where two tool calls from one
// turn are indistinguishable from one call each from two turns. runToolLoop now
// reports every request it issues via onModelCall, counted where the calls are
// actually made — so the figure is exact, the [low, high] bracket is gone, and
// so is the closing line's "may have taken it past" hedge, which could only be
// written because nobody was counting at the socket.
export interface RunSpend {
  /** Model calls actually issued, counted by runToolLoop as each one goes out. */
  calls: number;
}

/**
 * The closing line of a run: what was quoted, what was spent, and — when the
 * shape went over — that it went over, in the first clause rather than buried.
 * A tool-heavy shape is otherwise invisible to the operator: the chip says 5, the
 * bill says 10, and nothing on screen ever connects the two.
 */
const spendLine = (quoted: number, spend: RunSpend): string => {
  const calls = `${spend.calls} model call${spend.calls === 1 ? "" : "s"}`;
  const head = `shape done · quoted ${quoted}+ · spent ${calls}`;
  if (spend.calls > quoted) {
    return `${head} — ${spend.calls - quoted} OVER the quote. Tools are why: a node that calls one has to answer the result in another call. That is what the "+" on the quote is for.`;
  }
  return `${head} — inside the quote.`;
};

/** What the UI shows while a shape is executing. Never persisted — a run dies with the tab. */
export interface TopologyRun {
  projectId: string;
  /** Preset id or a saved shape's id — the runner stopped distinguishing them. */
  shapeId: string;
  /** 1-based phase index; 0 while queued behind another fan-out. */
  step: number;
  steps: number;
  /** Human label for the phase in flight, e.g. "fan-out · 3 workers". */
  label: string;
}

const phaseLabel = (phase: Phase): string => {
  switch (phase.kind) {
    case "decompose":
      return `decompose · ${phase.node.id}`;
    case "fanout":
      return `fan-out · ${phase.nodes.length} worker${phase.nodes.length === 1 ? "" : "s"}`;
    case "sequence":
      return `sequence · ${phase.nodes.length} in turn`;
    case "handoff":
      // Deliberately not the sequence label with a different noun. The two
      // phases run the same agents in the same order for the same price, so
      // this strip is the only place the run itself tells the operator WHICH of
      // the two is on screen — "in line" against "in turn".
      return `hand-off · ${phase.nodes.length} in line`;
    case "synthesize":
      return `${phase.node.role === "judge" ? "judge" : "synthesize"} · ${phase.node.id}`;
  }
};

export interface Channel {
  participants: string[];
  messages: Message[];
  queue: QueuedLine[];
}

/**
 * What the WORK panel knows about a project's repo — the two cards beside the
 * room used to be hardcoded, and the agents sitting in that room were already
 * reading the real thing.
 *
 * Kept in the store, not in the component, so tabbing overview → work → back
 * doesn't spend another two requests from an hourly budget of sixty.
 *
 * `phase` is not derivable from the two feeds. A null feed means BOTH "not
 * asked yet" and "asked, told nothing", and those two must never draw the same
 * — loading is not empty. And a project the operator minted in the hub chat is
 * never asked at all: "no repo" is a fact about the project, not a failed
 * request, and it is free to say.
 */
export interface RepoWork {
  phase: "loading" | "ready" | "no-repo";
  tree: RepoFeed<TreeEntry> | null;
  issues: RepoFeed<IssueEntry> | null;
  /** REPO-OPS-1: hub/* branches with their PR state — the gate loop's tail. */
  branches: RepoFeed<BranchEntry> | null;
}

// Agents allowed in a project's room: every global agent + the ones scoped to it.
export const agentInScope = (a: Agent, projectId: string) =>
  a.scope === "global" || a.scope.projectId === projectId;

const STAR_KEY = "agent-hub:starred";
const loadStars = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]");
  } catch {
    return [];
  }
};

interface HubState {
  projects: Project[];
  agents: Agent[];
  structural: StructuralEdge[];
  assignments: Record<string, string>;
  stage: Stage;
  projectMode: ProjectMode;
  roomDrawer: boolean; // overview mode: is the chat drawer open?
  channels: Record<string, Channel>;
  conversation: Conversation | null; // agent DM drawer
  tray: string[];
  starred: string[];
  search: string;
  harnessSweepDone: boolean;
  mapLocked: boolean;
  toggleMapLock: () => void;
  commitsArmed: boolean;
  setCommitsArmed: (v: boolean) => void;
  brainConnected: boolean; // a BYOK Anthropic key is present in this browser
  setBrainConnected: (v: boolean) => void;
  focusRequest: { pos: Vec; seq: number } | null;
  createProject: (name: string) => string;
  hydrateActivity: (projectId: string) => Promise<void>;
  /** The WORK panel's tree + issues, per project. Never persisted — a session's cache is enough. */
  repoWork: Record<string, RepoWork>;
  hydrateWork: (projectId: string) => Promise<void>;

  moveNode: (id: string, pos: Vec) => void;
  /** moveNode, many at once — how the arrange button lands a computed layout. */
  applyLayout: (positions: Record<string, Vec>) => void;
  openStage: (projectId: string) => void;
  backToGraph: () => void;
  setProjectMode: (m: ProjectMode) => void;
  toggleRoomDrawer: () => void;
  toggleStar: (projectId: string) => void;
  setSearch: (q: string) => void;
  advanceChannel: (projectId: string) => void;
  sendToChannel: (projectId: string, text: string) => void;
  streamAgent: (projectId: string, agentId: string, opts?: TurnBrief) => Promise<void>;
  topologyRun: TopologyRun | null;
  /**
   * The last completed shape run as a gradable artifact — in memory only, a
   * run's export dies with the tab (the journal keeps the numbers; the FILE is
   * something you download while it's warm).
   */
  lastRunExport: RunExportV1 | null;
  /**
   * `quoted` is the number the launcher put on the button. Optional so callers
   * that never showed a price (tests, programmatic runs) keep working; when it
   * IS passed it is checked against the shape as resolved here, and a
   * disagreement refuses the run.
   */
  runTopology: (projectId: string, shapeId: string, task: string, quoted?: number) => Promise<void>;
  streamDm: (agentId: string) => Promise<void>;
  approveAction: (projectId: string, msgId: string) => void;
  removeFromRoom: (projectId: string, agentId: string) => void;
  dismissAction: (projectId: string, msgId: string) => void;
  summon: (agentId: string, projectId: string) => void;
  openChat: (agentId: string) => void;
  closePanels: () => void;
  sendUser: (text: string) => void;
  advance: () => void;
  toggleTray: (agentId: string) => void;
  clearTray: () => void;
  convene: () => void;
  tick: () => void;
  assign: (agentId: string, projectId: string) => void;
  unassign: (agentId: string) => void;
}

const restingStatus = (agentId: string, assignments: Record<string, string>) =>
  assignments[agentId] ? ({ kind: "working", projectId: assignments[agentId] } as const) : ({ kind: "idle" } as const);

/**
 * BEING IN A ROOM IS BEING ON THE PROJECT.
 *
 * The hub kept two truths about that and let them drift: `channel.participants`
 * (who is in the room) and `assignments` (who the constellation and the sidebar
 * draw a work edge for). `summon` wrote both; every OTHER way into a room — an
 * @mention, the default responders, an agent pulled in by a topology node —
 * wrote only the first. The result an operator sees is an agent talking in
 * #crashkit while the map shows it idle and unattached, which reads as a broken
 * map rather than as two lists disagreeing.
 *
 * This is the one place that adds someone to a room, so the two cannot part
 * again. Returns the patch, not the state: callers are already inside a `set`
 * and own the rest of their update.
 */
const joinRoom = (
  s: { assignments: Record<string, string>; agents: Agent[] },
  projectId: string,
  agentIds: string[]
): { assignments: Record<string, string>; agents: Agent[] } => {
  // Only agents whose assignment actually changes — an agent already working
  // here keeps its status object, so a `talking` agent is not reset to
  // `working` mid-stream by its own arrival.
  const joining = agentIds.filter((id) => s.assignments[id] !== projectId);
  if (joining.length === 0) return { assignments: s.assignments, agents: s.agents };
  const assignments = { ...s.assignments };
  for (const id of joining) assignments[id] = projectId;
  return {
    assignments,
    agents: s.agents.map((a) =>
      joining.includes(a.id) ? { ...a, status: { kind: "working" as const, projectId } } : a
    ),
  };
};

// One hydration attempt per project per session — success or failure, we don't
// hammer an unauthenticated API that rate-limits at 60/hr.
//
// A Map of the in-flight promise rather than a Set of ids, because the WORK
// panel now has to WAIT on this: its tasks card falls back to these commits
// when a repo has no open issues, and a second caller that returned instantly
// would let the card announce "no commits either" in the gap before the first
// call lands. Same one-attempt guarantee; it is just awaitable now.
const hydrationAttempted = new Map<string, Promise<void>>();

// The same discipline for the WORK panel's own two requests. Separate from the
// commit feed because they are separate calls with separate failure modes — and
// because a project with no repo skips them entirely, which the commit path has
// no way to express.
const workAttempted = new Set<string>();

// One live stream per room at a time.
const liveStreams = new Set<string>();

// Where the shape in flight started in the room's transcript. A room turn reads
// the last 20 messages, which is right for chat and wrong for a shape: a
// multi-round shape can put more than 20 lines on the board, and the round-2
// brief PROMISES that round 1 and the verdict on it are above. So a node's
// window is widened back to the run's own first line — and no further. Not on
// TopologyRun because it is not something the UI shows, and not persisted
// because a run dies with the tab.
//
// A HAND-OFF phase drives the SAME dial the other way: instead of widening the
// floor back to the task, it moves the floor FORWARD to the single message the
// node was handed, and `exact` says that floor is the whole window rather than a
// minimum. The flag is the part that matters — leave the 20-message chat memory
// underneath and a link reads straight past its predecessor into the chain it is
// not supposed to see, which is the one thing the shape exists to prevent. One
// dial, two ends: a second context path beside this one would be a second thing
// to keep true, and only one of them would get tested.
let runFloor: { projectId: string; msgId: string; exact?: true } | null = null;

// FAILURE MODE (silently swallowed follow-up): the composer stays enabled while
// an agent streams, so an operator message sent mid-stream used to hit an
// early-return guard and never get answered. Requests are now SERIALIZED per
// key instead of dropped: a second request waits for the in-flight one and then
// runs against the updated transcript. Never two concurrent runs on one key.
const chains = new Map<string, Promise<void>>();
// Take a ticket for `key`: registers this caller as the new tail (so anyone
// arriving later queues behind it), waits for the previous holder, and hands
// back the release. Tickets never reject — release always runs in a finally.
const takeTurn = async (key: string): Promise<() => void> => {
  const prev = chains.get(key);
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  chains.set(key, mine);
  if (prev) await prev;
  return () => {
    if (chains.get(key) === mine) chains.delete(key);
    release();
  };
};

// Leaving a room, in full. FAILURE MODE (the ghost that keeps talking): pulling
// an agent out of `participants` left their already-queued canned lines in the
// channel queue, so a released agent went on speaking for as long as the queue
// took to drain. Their pending lines leave with them.
const departure = (ch: Channel, agentId: string) => ({
  participants: ch.participants.filter((p) => p !== agentId),
  queue: ch.queue.filter((q) => q.from !== agentId),
});

// Is a live agent stream painting into this room right now?
const liveInChannel = (projectId: string) => {
  const prefix = `ch:${projectId}:`;
  for (const key of liveStreams) if (key.startsWith(prefix)) return true;
  return false;
};

// Critic finding: every path that drops a conversation must rest its speakers,
// or agents stay "talking" forever and the tick loop can never rescue them.
const restTalking = (agents: Agent[], assignments: Record<string, string>, except?: string) =>
  agents.map((a) =>
    a.id !== except && a.status.kind === "talking" ? { ...a, status: restingStatus(a.id, assignments) } : a
  );

const SEED_PROJECT_IDS = new Set(PROJECTS.map((p) => p.id));

// Critic finding: zustand's persist doesn't listen for cross-tab writes, so a
// stale tab could overwrite localStorage and revert an APPROVED gate card to
// pending (and drop the project it created). The gate's record must be durable:
// adopt other tabs' writes as they happen.
let adoptingExternal = false;
if (typeof window !== "undefined") {
  addEventListener("storage", (e) => {
    if (e.key !== "agent-hub:state" || !e.newValue) return;
    adoptingExternal = true;
    try {
      void useHub.persist.rehydrate();
    } finally {
      setTimeout(() => {
        adoptingExternal = false;
      }, 0);
    }
  });
}

export const useHub = create<HubState>()(
  persist(
    (set, get) => ({
  projects: PROJECTS,
  agents: AGENTS.map((a) =>
    SEED_ASSIGNMENTS[a.id] ? { ...a, status: { kind: "working", projectId: SEED_ASSIGNMENTS[a.id] } } : a
  ),
  structural: STRUCTURAL,
  assignments: { ...SEED_ASSIGNMENTS },
  stage: { kind: "graph" },
  projectMode: "overview",
  roomDrawer: false,
  channels: {},
  conversation: null,
  tray: [],
  starred: loadStars(),
  search: "",
  harnessSweepDone: false,
  mapLocked: false,
  toggleMapLock: () => set((s) => ({ mapLocked: !s.mapLocked })),
  // DANGER ZONE: off unless the operator armed it AND a token exists.
  commitsArmed: getGhToken() !== null,
  setCommitsArmed: (v) => {
    // The arming itself is a ledger event: it is the moment the room's tool
    // list grows a write path, and "when was the danger zone on" is exactly
    // the question an audit asks. Only a real flip is recorded.
    if (get().commitsArmed !== v) appendJournal({ kind: "arm", on: v });
    set({ commitsArmed: v });
  },
  brainConnected: getKey() !== null,
  setBrainConnected: (v) => set({ brainConnected: v }),
  focusRequest: null,

  // Agents can act on the hub: a chat command mints a real project node.
  createProject: (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
    if (get().projects.some((p) => p.id === id)) return id;
    const HUES = ["#22d3ee", "#a78bfa", "#60a5fa", "#2dd4bf", "#f472b6", "#fbbf24"];
    const project: Project = {
      id,
      name: id,
      tagline: "Fresh from the hub — wire it up.",
      langs: ["TBD"],
      pos: { x: 700 + Math.random() * 300, y: 300 + Math.random() * 260 },
      hue: HUES[Math.floor(Math.random() * HUES.length)],
      activity: ["created from the hub chat", "no CI yet", "no agents assigned"],
    };
    set((s) => ({ projects: [...s.projects, project] }));
    return id;
  },

  moveNode: (id, pos) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, pos } : p)),
      agents: s.agents.map((a) => (a.id === id ? { ...a, pos } : a)),
    })),

  // The arrange button's write path: the same projects/agents `pos` fields a
  // hand-drag goes through (so partialize's `positions` persists the arranged
  // map identically), but in ONE set — 25 sequential moveNode calls would fan
  // out 25 store updates and 25 persist writes for a single gesture. Ids the
  // layout doesn't know (none today) are simply left where they were.
  applyLayout: (positions) =>
    set((s) => ({
      projects: s.projects.map((p) => (positions[p.id] ? { ...p, pos: positions[p.id] } : p)),
      agents: s.agents.map((a) => (positions[a.id] ? { ...a, pos: positions[a.id] } : a)),
    })),

  openStage: (projectId) => {
    const { channels, assignments, projects, agents } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    let channel = channels[projectId];
    if (!channel) {
      // Assigned agents plus project-scoped residents are in the room from the start.
      const present = Array.from(
        new Set([
          ...Object.entries(assignments).filter(([, pid]) => pid === projectId).map(([aid]) => aid),
          ...agents.filter((a) => a.scope !== "global" && a.scope.projectId === projectId).map((a) => a.id),
        ])
      );
      channel = {
        participants: present,
        messages: [],
        queue: present.length > 0 ? buildRoundtable(present, project.name) : [],
      };
    }
    set({
      stage: { kind: "project", id: projectId },
      projectMode: "overview",
      roomDrawer: false,
      channels: { ...channels, [projectId]: channel },
      conversation: null,
      agents: restTalking(agents, assignments),
    });
    void get().hydrateActivity(projectId);
    // NOT hydrated here: openStage always lands in overview, and the two cards
    // this feeds live only in the work tab. ProjectStage fires it when the mode
    // is actually work, so browsing worlds costs nothing.
  },

  hydrateActivity: async (projectId) => {
    const inFlight = hydrationAttempted.get(projectId);
    if (inFlight) return inFlight;
    // A project the operator minted in the chat has no repo to have commits in.
    // Asking anyway spent a request from a 60/hr budget to be told 404 — the
    // curated "created from the hub chat" lines were going to stand either way.
    if (!SEED_PROJECT_IDS.has(projectId)) {
      hydrationAttempted.set(projectId, Promise.resolve());
      return;
    }
    const run = (async () => {
      try {
        const lines = await fetchRecentCommits(projectId);
        if (lines.length === 0) return; // 404/rate-limit/renamed repo → keep mock
        set((s) => {
          const ch = s.channels[projectId];
          const speaker = ch?.participants[0];
          return {
            projects: s.projects.map((p) => (p.id === projectId ? { ...p, liveActivity: lines } : p)),
            // the room reacts to real context: first agent present reports the pull
            channels: speaker
              ? {
                  ...s.channels,
                  [projectId]: {
                    ...ch,
                    queue: [
                      ...ch.queue,
                      { from: speaker, text: `Pulled the live feed — latest commit here is "${lines[0]}". Working from that, not from memory.` },
                    ],
                  },
                }
              : s.channels,
          };
        });
      } catch {
        /* offline — the curated mock feed stands */
      }
    })();
    // Registered before this function can yield, so two openStage calls in the
    // same tick still produce exactly one request.
    hydrationAttempted.set(projectId, run);
    return run;
  },

  repoWork: {},

  // The WORK panel's two cards. Lazy and once-per-project-per-session, because
  // these are two more requests against the SAME 60/hr unauthenticated budget
  // the commit feed is already spending from — doing this for all 18 projects
  // up front would empty it in one browsing session and leave every card blank
  // for an hour. github.ts parks the answers (failures included) in
  // sessionStorage, so a tab reload doesn't re-spend either.
  hydrateWork: async (projectId) => {
    if (workAttempted.has(projectId)) return;
    workAttempted.add(projectId);
    // A project the operator minted in the chat has no repo behind it. Asking
    // GitHub would spend two requests to be told 404, and the card would then
    // say "the request failed" — a different sentence from "there is nothing
    // here to read", and the wrong one.
    if (!SEED_PROJECT_IDS.has(projectId)) {
      set((s) => ({ repoWork: { ...s.repoWork, [projectId]: { phase: "no-repo", tree: null, issues: null, branches: null } } }));
      return;
    }
    set((s) => ({ repoWork: { ...s.repoWork, [projectId]: { phase: "loading", tree: null, issues: null, branches: null } } }));
    // All at once. The commit hydration is in here — not just beside it —
    // because the tasks card falls back to those commits when a repo has no open
    // issues; settling `ready` before they land would flash "no commits either"
    // at a repo with plenty. None of the repo fetchers throws: a failure arrives
    // as a status, which is the whole reason they return a status. The branch
    // feed rides the armed PAT when one exists — private repos and a real
    // budget — and degrades to the same unauthenticated vocabulary without it.
    try {
      const [tree, issues, branches] = await Promise.all([
        fetchRepoTree(projectId),
        fetchOpenIssues(projectId),
        fetchHubBranches(projectId, getGhToken()),
        get().hydrateActivity(projectId),
      ]);
      set((s) => ({ repoWork: { ...s.repoWork, [projectId]: { phase: "ready", tree, issues, branches } } }));
    } catch {
      // "No fetcher throws" is a property of today's code, not a law. If one
      // ever does, the un-caught rejection leaves phase pinned at "loading"
      // and workAttempted already set — both cards read "reading github…"
      // forever with no way back. Settle a terminal state instead.
      const failed = { status: "failed" as const, items: [], more: 0 };
      set((s) => ({ repoWork: { ...s.repoWork, [projectId]: { phase: "ready", tree: failed, issues: failed, branches: failed } } }));
    }
  },

  backToGraph: () => set({ stage: { kind: "graph" } }),
  setProjectMode: (m) => set({ projectMode: m }),
  toggleRoomDrawer: () => set((s) => ({ roomDrawer: !s.roomDrawer })),

  toggleStar: (projectId) =>
    set((s) => {
      const starred = s.starred.includes(projectId)
        ? s.starred.filter((x) => x !== projectId)
        : [...s.starred, projectId];
      try {
        localStorage.setItem(STAR_KEY, JSON.stringify(starred));
      } catch {
        /* private mode — stars just don't persist */
      }
      return { starred };
    }),

  setSearch: (q) => set({ search: q }),

  advanceChannel: (projectId) => {
    const channel = get().channels[projectId];
    if (!channel || channel.queue.length === 0) return;
    const [next, ...rest] = channel.queue;
    // FAILURE MODE (fiction laundered into a real transcript): the canned queue
    // kept draining on its 1.5s timer while a live agent was streaming, so mock
    // lines landed under a half-written real reply — and then went out as
    // context to the next responder as if an agent had actually said them.
    // CHOICE: DROP, not hold. A canned line is a stand-in for a reply a real
    // agent is giving right now; replaying it later would still put words in
    // that agent's mouth. Same cadence, so the queue empties instead of
    // stockpiling behind the stream.
    if (get().brainConnected && liveInChannel(projectId)) {
      set((s) => {
        const ch = s.channels[projectId];
        if (!ch) return {};
        return { channels: { ...s.channels, [projectId]: { ...ch, queue: ch.queue.slice(1) } } };
      });
      return;
    }
    set((s) => ({
      channels: {
        ...s.channels,
        [projectId]: { ...channel, messages: [...channel.messages, { id: nextId(), from: next.from, text: next.text }], queue: rest },
      },
    }));
  },

  // @-mentions route the reply: "@Forge do X" answers from Forge alone (and
  // pulls him into the room if he's in scope); "@team" polls everyone present.
  sendToChannel: (projectId, text) => {
    const { channels, agents } = get();
    const channel = channels[projectId];
    if (!channel) return;

    // Agents acting on the project — mock command handlers, LLM-tool-shaped.
    // "run the sweep" REPLAYS the recorded result (the real sweep runs in the
    // repo). Anchored so questions and negations don't trigger it.
    if (projectId === "harness-builder" && /^\/?(re)?run the sweep\b/i.test(text.trim())) {
      const sweep: QueuedLine[] = [
        { from: "oracle", text: "Replaying the recorded sweep — the real one runs in the repo: 3 harness shapes × 20 tasks, deterministic graders, mock provider." },
        { from: "oracle", text: "one drafter — 95% · $0.031 · 2.2s/task. planner→drafter — 90% · $0.264. planner→2 drafters→judge — 80% · $0.692." },
        { from: "oracle", text: "17 of 20 tasks tied. Three discordant pairs cannot clear p<0.05 — this suite cannot decide between them. That is a limit of the suite, not a finding about the harnesses." },
        { from: "critic", text: "Confirming the refusal is correct: a leaderboard would have printed 95 vs 80 and let you conclude. The honest output is the instrument statement." },
      ];
      set((s) => ({
        harnessSweepDone: true,
        channels: {
          ...s.channels,
          [projectId]: {
            ...channel,
            participants: Array.from(new Set([...channel.participants, "oracle", "critic"])),
            messages: [...channel.messages, { id: nextId(), from: "user", text }],
            queue: [...sweep, ...channel.queue],
          },
        },
        ...joinRoom(s, projectId, ["oracle", "critic"]),
      }));
      return;
    }

    // "new project: <name>" mints a node in the constellation, live.
    const create = text.match(/^\/?new project:?\s+(.{2,40})$/i);
    if (create) {
      const slug = create[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
      const taken =
        get().projects.some((p) => p.id === slug) || get().agents.some((a) => a.id === slug);
      const reply = taken
        ? `"${slug}" is already on the board — pick another name.`
        : `Done — ${slug} is on the board. It has no CI, no claims, and no crew yet: exactly how every honest project starts.`;
      if (!taken) get().createProject(create[1]);
      set((s) => {
        const ch = s.channels[projectId]!;
        return {
          channels: {
            ...s.channels,
            [projectId]: {
              ...ch,
              messages: [...ch.messages, { id: nextId(), from: "user", text }],
              queue: [{ from: ch.participants[0] ?? "strat", text: reply }, ...ch.queue],
            },
          },
        };
      });
      return;
    }

    const mentionTeam = /@team\b/i.test(text);
    const mentioned = agents.filter(
      (a) => agentInScope(a, projectId) && new RegExp(`@${a.name}\\b`, "i").test(text)
    );

    let participants = channel.participants;
    let responders: string[];
    if (mentionTeam) {
      responders = participants;
    } else if (mentioned.length > 0) {
      participants = Array.from(new Set([...participants, ...mentioned.map((a) => a.id)]));
      responders = mentioned.map((a) => a.id);
    } else if (participants.length > 0) {
      responders = participants.slice(0, 3);
    } else {
      // an empty room must not be a silent dead end: the first in-scope global
      // agent joins and answers
      const joiner = agents.find((a) => a.scope === "global");
      participants = joiner ? [joiner.id] : [];
      responders = participants;
    }

    // Brain connected → every responder answers for real, sequentially, each
    // seeing the replies before it (a genuine roundtable). No key → personas.
    if (get().brainConnected && responders.length > 0) {
      set((s) => ({
        channels: {
          ...s.channels,
          [projectId]: {
            ...channel,
            participants,
            messages: [...channel.messages, { id: nextId(), from: "user", text }],
          },
        },
        // An @mention pulls an agent into the room; being in the room is being
        // on the project. streamAgent would join them anyway, but not until it
        // actually starts streaming — the map should not lag the transcript.
        ...joinRoom(s, projectId, participants),
      }));
      // FAILURE MODE (replies attached to the wrong question): a second @team
      // message used to start its own fan-out immediately — the busy agent was
      // skipped and the NEXT agent began streaming concurrently, answering
      // message 2 while message 1's roundtable was still going, so the two
      // conversations interleaved. One fan-out per room at a time: the second
      // message's roundtable starts only when the first one is done.
      void (async () => {
        const releaseFanout = await takeTurn(`fan:${projectId}`);
        try {
          for (const r of responders) await get().streamAgent(projectId, r);
        } finally {
          releaseFanout();
        }
      })();
      return;
    }

    const replies: QueuedLine[] =
      responders.length === 1
        ? [{ from: responders[0], text: personaFor(responders[0]).reply(text, projectId) }]
        : responders.map((p) => ({ from: p, text: personaFor(p).ack(text) }));

    set((s) => ({
      channels: {
        ...s.channels,
        [projectId]: {
          ...channel,
          participants,
          messages: [...channel.messages, { id: nextId(), from: "user", text }],
          queue: [...replies, ...channel.queue],
        },
      },
      // The mock path never reaches streamAgent — its replies are drained from
      // the queue — so without this an agent could answer in a room all session
      // and never appear on the map.
      ...joinRoom(s, projectId, participants),
    }));
  },

  topologyRun: null,
  lastRunExport: null,

  // Run a SHAPE in this room. The engine (agents/topology.ts) says what the
  // shape is and what each node is told; this executes it against the same live
  // path a normal room turn takes — same system prompt, same transcript, same
  // tools, same gate. The only thing a topology adds is WHEN each node speaks.
  //
  // Fan-out is the whole reason this exists: the room's existing @team poll is
  // sequential by design (each agent sees the ones before it), so the one thing
  // it structurally cannot do is ask three agents the same question
  // independently. A `fanout` phase issues its nodes with Promise.all — they go
  // out together, none sees another's answer, and only the synthesize phase
  // reads all of them.
  //
  // On price: the quote is a FLOOR, not a promise. Tools stay live inside a
  // shape — a worker that can read the repo is the point — so a node may take
  // more than one model call, and no count made before the run can know how
  // many. The launcher says "N+" for that reason, and the run closes by naming
  // both numbers: what was quoted, and what it actually spent.
  runTopology: async (projectId, shapeId, task, quoted) => {
    const trimmed = task.trim();
    const channel = get().channels[projectId];
    if (!channel || !trimmed) return;
    // One shape at a time, hub-wide: two concurrent runs would interleave in the
    // transcript and quietly double the bill.
    if (get().topologyRun) return;

    // Returns the id it wrote. Most callers ignore it — but an empty hand-off is
    // announced with this same note AND is then the only thing the next link is
    // shown, so the run has to be able to point a floor at the line it just
    // posted. One line doing both jobs is the point: the operator cannot be
    // shown one explanation while the model is quietly given another.
    const note = (text: string) => {
      const id = nextId();
      set((s) => {
        const ch = s.channels[projectId];
        if (!ch) return {};
        return {
          channels: { ...s.channels, [projectId]: { ...ch, messages: [...ch.messages, { id, from: "ops", text }] } },
        };
      });
      return id;
    };

    // No key, no run — and say so rather than failing silently or, worse,
    // pretending with canned lines. A topology's whole claim is that these are
    // real model calls in a real shape.
    if (!get().brainConnected) {
      note("⚠ a topology needs a live brain — add an Anthropic key in the brain menu, then run the shape.");
      return;
    }

    // A shape id is looked up in the operator's saved shapes FIRST and falls
    // back to the presets. Both sides hand back the same thing — a Topology
    // whose stages the planner reads — so nothing below this line knows or
    // cares which one it got, and a composed shape runs the preset's path.
    const saved = getShape(shapeId);
    let topology: Topology;
    if (saved) {
      // The gate, here and not only in the composer: a shape is designed once
      // and launched later, and the room it was composed against can lose an
      // agent in between. validateShape is given the room's participants, so a
      // departed agent is NAMED rather than quietly dropped — a shape that
      // silently runs two-thirds of itself is worse than one that refuses.
      // Before the plan, so a bad shape cannot reach a single model call.
      const problems = validateShape(saved.stages, channel.participants);
      if (problems.length > 0) {
        note(`⚠ "${saved.label}" can't run as saved — nothing spent. ${problems.join(" ")}`);
        return;
      }
      topology = toTopology(saved);
    } else {
      const build = PRESETS[shapeId];
      // Neither saved nor preset: the launcher is holding an id that no longer
      // exists — a shape deleted in this tab's other window. Say so; a launch
      // button that does nothing at all reads as a broken app.
      if (!build) {
        note(`⚠ no shape called "${shapeId}" — it may have been deleted.`);
        return;
      }
      // A preset is rebuilt from whoever is in the room at launch, so its
      // agents are known by construction and the engine already skips a stage
      // the room is too small to fill. Validating it would refuse rooms that
      // work today: a one-agent fan-out has an empty worker stage.
      topology = build(channel.participants);
    }

    // The chip that priced this run read the saved shapes when the strip
    // mounted; the runner re-reads them at the click. A shape edited in another
    // tab in between is therefore QUOTED at the old price and RUN at the new
    // one, and the operator only finds out on the bill. Closed here rather than
    // at the chip, because the runner is the only place that knows what is
    // actually about to run: the launcher hands over the number it displayed,
    // and that number has to still be true. Before the plan, so a mispriced
    // shape cannot reach a single model call.
    const price = callCount(topology);
    if (quoted !== undefined && quoted !== price) {
      note(
        `⚠ "${topology.label}" was quoted at ${quoted}+ model calls but now plans ${price}+ — it changed after the launcher priced it (edited in another tab?). Nothing spent. Reload so the strip re-prices it, then run.`
      );
      return;
    }

    const phases = plan(topology);
    if (phases.length === 0) {
      note("⚠ nobody in the room to run that shape — summon at least one agent first.");
      return;
    }

    // The operator's task is the operator's line: it enters the transcript as
    // theirs, so every node's context contains it verbatim. Its id is also the
    // floor of the run — every later stage reads back at least this far, which
    // is how a round-2 worker sees round 1 and the verdict on it.
    const taskMsgId = nextId();
    set((s) => {
      const ch = s.channels[projectId];
      if (!ch) return {};
      return {
        channels: { ...s.channels, [projectId]: { ...ch, messages: [...ch.messages, { id: taskMsgId, from: "user", text: trimmed }] } },
      };
    });
    runFloor = { projectId, msgId: taskMsgId };

    // THE HAND: the one line a hand-off link is shown, and the only line it is
    // shown. It starts at the operator's task, which is exactly what the FIRST
    // node of a chain gets — nothing ran ahead of it, so there is nothing else
    // it could honestly be handed, and `exact` above is what stops the room's
    // ordinary chat window from quietly adding some.
    let hand = taskMsgId;

    // The wording an empty hand-off travels as. One line doing two jobs: the
    // operator reads it in the transcript, and it is also the ENTIRE context the
    // next link gets — so it has to say what happened and what to do about it,
    // not just flag a gap.
    const emptyHandoff = (subject: string) =>
      `⚠ hand-off · ${subject} produced nothing — the hand-off is EMPTY. This line is what travels on in its place: there is no artifact to work from, and the task is NOT being handed back, so name what is missing rather than inventing what was lost.`;

    /**
     * The line a node left in the room, or null if it left nothing to hand on.
     * There is no separate bookkeeping for this because none is needed:
     * streamAgent DELETES a turn's message when the model produced no text at
     * all, and replaces it with a "⚠ …" line when the stream died before a
     * single token — so the transcript already records whether an artifact
     * exists, and the operator is looking at the same evidence the runner is.
     * A turn that failed PART-WAY keeps what it streamed, and that partial is
     * handed on: it is real work, and telling the next link the hand-off was
     * empty when it was not is the same lie pointing the other way.
     */
    const leftBy = (node: TopologyNode): string | null => {
      const msgs = get().channels[projectId]?.messages ?? [];
      // From the run's own floor, because a previous run of the same shape left
      // the same node ids in this transcript and the first match room-wide
      // would be that one. FIRST match from there, not last: a gated proposal
      // appends a second card under the same stamp, and what gets handed on is
      // the turn's own line. And the STAMP rather than the agent id, because one
      // agent can speak twice in a shape.
      const from = msgs.findIndex((m) => m.id === taskMsgId);
      const line = msgs
        .slice(from < 0 ? 0 : from)
        .find((m) => m.node?.topology === topology.id && m.node.id === node.id);
      if (!line) return null;
      const text = line.text.trim();
      return text.length > 0 && !text.startsWith("⚠") ? line.id : null;
    };

    // The run's own record, for the export: when it started, and one row per
    // node turn in execution order with the model it was routed to and — for
    // handoff links — which single message it was handed. Collected at the
    // call site because that is where these facts are true; everything else in
    // the export is read back off the transcript the operator already saw.
    const startedAt = new Date().toISOString();
    const nodeRecords: RunExportNode[] = [];

    // Marked running BEFORE queueing, so the launch button disables on the click
    // rather than whenever an in-flight roundtable happens to finish.
    set({ topologyRun: { projectId, shapeId, step: 0, steps: phases.length, label: "queued" } });
    // Shares the room's fan-out lock with @team: a shape never interleaves with
    // a roundtable that is already speaking.
    const releaseFanout = await takeTurn(`fan:${projectId}`);
    // Every node turn adds itself here as it finishes, so what the closing line
    // reports is measured, not planned.
    const spend: RunSpend = { calls: 0 };
    try {
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        set({ topologyRun: { projectId, shapeId, step: i + 1, steps: phases.length, label: phaseLabel(phase) } });
        // Where this phase starts writing, so a hand-off stage that does NOT
        // open the run can be handed what the step immediately before it left.
        const mark = get().channels[projectId]?.messages.length ?? 0;
        const turn = (node: TopologyNode, handedFrom: string | null = null) => {
          nodeRecords.push({
            phase: phase.kind,
            nodeId: node.id,
            role: node.role,
            agentId: node.agentId,
            model: getOverride(node.agentId)?.model ?? modelForAgent(node.agentId),
            handedFrom,
          });
          return get().streamAgent(projectId, node.agentId, {
            brief: briefFor(phase.kind, node, trimmed),
            node: { topology: topology.id, phase: phase.kind, id: node.id, role: node.role },
            spend,
          });
        };
        if (phase.kind === "handoff") {
          // THE ASSEMBLY LINE. Same nodes, same order and same price as a
          // sequence — the entire difference is which floor is under each one,
          // and this loop is the only place it is set. Note what does NOT
          // change: the transcript. Every link still writes into the room in
          // full, so the operator watches the whole line even though no agent
          // on it can see past one station. Narrowing what the MODEL reads is
          // not narrowing what the operator reads, and conflating the two would
          // hide exactly the drift this shape is built to expose.
          if (!phase.nodes[0]?.head && hand === taskMsgId) {
            // `head` is off precisely because something DID run ahead of this
            // chain — so if `hand` is still the task, that upstream step left
            // nothing. Falling back to the task here would hand the first link
            // the run's opening line and let it answer as though the chain
            // started with it, contradicting the flag the engine set.
            hand = note(emptyHandoff("the step before this chain"));
          }
          for (const node of phase.nodes) {
            runFloor = { projectId, msgId: hand, exact: true };
            await turn(node, hand);
            // An upstream node that produced nothing must not leave the next
            // link reading whatever sits above IT — with the floor unmoved that
            // is the task, and the link would answer as a first agent, which is
            // the one lie the chain's opening brief exists to prevent. The
            // hand-off travels as an explicit empty instead.
            hand = leftBy(node) ?? note(emptyHandoff(`${node.id} (${node.agentId})`));
          }
          // Back to the run's own window. A later stage is a conversation again
          // unless it says otherwise, and leaving the last link's one-message
          // floor in place would blind it.
          runFloor = { projectId, msgId: taskMsgId };
        } else {
          if (phase.kind === "fanout") {
            // CONCURRENT — the point of the shape. Each node takes its own
            // per-agent turn ticket, so serialization per agent is untouched.
            // (Explicit lambda: .map(turn) would feed the array INDEX into
            // turn's handedFrom parameter.)
            await Promise.all(phase.nodes.map((n) => turn(n)));
          } else if (phase.kind === "sequence") {
            for (const node of phase.nodes) await turn(node);
          } else {
            await turn(phase.node);
          }
          // What a FOLLOWING hand-off stage gets handed: this step's output,
          // from its first line on. For a solo that is one line; for a fan-out
          // it is all of them, because what a chain takes is whatever ran
          // immediately before it, and picking one worker out of three to keep
          // the hand down to a single message would bin two answers the
          // operator paid for.
          // Held to the SAME bar leftBy applies inside a chain: a turn that
          // errored keeps its node stamp (streamAgent rewrites the text to a ⚠
          // line rather than deleting it), so a bare `find(m => m.node)` would
          // hand an error string to the first link as if it were the artifact.
          // hand is reset first so a stale one from two phases back can never be
          // handed on in its place. Back to taskMsgId, which is this function's
          // existing "nothing was handed" sentinel — the branch above turns it
          // into an explicit empty hand-off rather than a silent restart.
          hand = taskMsgId;
          const opened = (get().channels[projectId]?.messages ?? [])
            .slice(mark)
            .find((m) => m.node && m.text.trim().length > 0 && !m.text.trim().startsWith("⚠"));
          if (opened) hand = opened.id;
        }
      }
    } finally {
      // Posted in the finally, so a run that dies half-way still says what it
      // burned getting there.
      note(spendLine(price, spend));
      // The same numbers go to the ledger, which outlives the transcript's
      // 80-message window — quoted-vs-actual per run is the audit trail the
      // whole spend-honesty claim rests on.
      appendJournal({
        kind: "run",
        project: projectId,
        shape: shapeId,
        label: topology.label,
        quoted: price,
        spent: spend.calls,
      });
      // The gradable artifact: the transcript slice the operator just watched
      // (task line through the closing spend line), the node records collected
      // at the call sites, and the run's pinned conditions. In memory only —
      // the export chip downloads it while it's warm.
      const allMsgs = get().channels[projectId]?.messages ?? [];
      const floorIdx = allMsgs.findIndex((m) => m.id === taskMsgId);
      const cfg = getGenConfig();
      const exportRecord: RunExportV1 = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: projectId,
        shape: { id: shapeId, label: topology.label },
        task: trimmed,
        config: { ...cfg, routeByRole: getRouting() },
        quoted: price,
        spent: spend.calls,
        startedAt,
        endedAt: new Date().toISOString(),
        nodes: nodeRecords,
        messages: allMsgs.slice(floorIdx < 0 ? 0 : floorIdx).map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      };
      runFloor = null;
      set({ topologyRun: null, lastRunExport: exportRecord });
      releaseFanout();
    }
  },

  // A live agent streaming from Anthropic with the room's transcript and the
  // project's live context. Tools and the operator gate are unchanged whoever
  // calls it: a topology node is this same turn with a one-turn brief prepended
  // to its system prompt and a node stamp on the message it writes.
  streamAgent: async (projectId, agentId, opts) => {
    const streamKey = `ch:${projectId}:${agentId}`;
    // FAILURE MODE (message dropped on the floor): this used to `return` when a
    // stream for this agent was already running, so an operator line typed
    // mid-stream got no answer at all. Queue instead — wait out the in-flight
    // run, then answer against the transcript that now includes the new line.
    // Still exactly one live stream per agent: the ticket is the mutex.
    const releaseTurn = await takeTurn(streamKey);
    liveStreams.add(streamKey);
    const msgId = nextId();
    // What this ONE turn costs — incremented by runToolLoop's onModelCall as
    // each request goes out, so a turn that never reached the model bills zero
    // and a turn that threw mid-stream bills for the request it had already
    // made. A node is not one model call: the loop answers every tool result
    // with another call, which is the whole reason a shape can overrun its quote.
    let modelCalls = 0;
    try {
      const { projects, channels } = get();
      const project = projects.find((p) => p.id === projectId);
      const channel = channels[projectId];
      if (!project || !channel) return;
      // The same open-issue list the work tab shows, so the room and the panel
      // never disagree about what is outstanding here.
      const openWork = get().repoWork[projectId]?.issues?.items.map((i) => `#${i.number} ${i.title}`);
      const persona = buildAgentSystem(agentId, project, detailFor(projectId), openWork);
      // The brief goes FIRST: it is this turn's job, and the persona below it is
      // who does the job. Nothing else about the turn changes.
      const system = opts?.brief ? `${opts.brief}\n\n${persona}` : persona;
      // A placeholder carries no content by definition. In a fan-out the other
      // workers' placeholders already exist by the time this one reads the
      // transcript, and feeding them through would send each worker a line
      // reading "[forge]: " — noise that also hints at who else is mid-answer.
      // Dropping them changes nothing on the sequential paths (a finished
      // message is never empty-and-streaming). Empty-text ACTION stamps (gate
      // cards, and now every free tool call's trace row) are dropped for the
      // same reason: they are operator-facing bookkeeping, and each one would
      // otherwise reach the model as another blank "[critic]: " line — one per
      // tool call, now that every call leaves a row.
      const transcript = (get().channels[projectId]?.messages ?? channel.messages).filter(
        (m) => !(m.text.length === 0 && (m.streaming || m.action))
      );
      // A phase threads context the only way it ever did — by reading the room
      // back off the transcript, which is why a later stage sees the earlier
      // ones at all. The one thing that breaks is the WINDOW: the default 20
      // messages is a chat-sized memory, and a multi-round shape can lay down
      // more than that before round 2 speaks, silently cutting round 1 out of
      // the context the round-2 brief says is there. During a run the window
      // reaches back to the run's first line and stops — bounded by the shape's
      // own caps, so it can't quietly grow into a bill nobody quoted.
      //
      // A HAND-OFF node is the same read with the floor pushed the other way:
      // its floor is the ONE message it was handed, and `exact` drops the 20 the
      // room would otherwise keep underneath. That subtraction is the whole
      // shape — hold the agents, the order and the price fixed against a
      // sequence, vary only this, and what is left is a controlled experiment in
      // context visibility. The room's chat memory quietly restoring the two
      // links back would not look like a bug; it would look like a result.
      const win = runFloor?.projectId === projectId ? runFloor : null;
      const floor = win ? transcript.findIndex((m) => m.id === win.msgId) : -1;
      const back = transcript.length - floor;
      const turns = toTurns(
        transcript,
        agentId,
        floor >= 0 ? (win!.exact ? back : Math.max(20, back)) : undefined,
        floor >= 0 && !!win?.exact
      );
      set((s) => {
        const ch = s.channels[projectId];
        if (!ch) return {};
        // Speaking in a room joins it — assignment and all, so the map shows
        // this agent working here instead of idle-and-unattached while it
        // talks. joinRoom runs FIRST; the talking status is layered on top of
        // whatever it produced.
        const joined = joinRoom(s, projectId, [agentId]);
        return {
          channels: {
            ...s.channels,
            [projectId]: {
              ...ch,
              participants: ch.participants.includes(agentId) ? ch.participants : [...ch.participants, agentId],
              messages: [...ch.messages, { id: msgId, from: agentId, text: "", streaming: true, ...(opts?.node ? { node: opts.node } : {}) }],
            },
          },
          assignments: joined.assignments,
          agents: joined.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "talking" as const } } : a)),
        };
      });
      let acc = "";
      let needBreak = false;
      let proposed = false;
      const paint = () => {
        const text = acc;
        set((s) => {
          const ch = s.channels[projectId];
          if (!ch) return {};
          return {
            channels: {
              ...s.channels,
              [projectId]: { ...ch, messages: ch.messages.map((m) => (m.id === msgId ? { ...m, text } : m)) },
            },
          };
        });
      };
      // A free tool call leaves its own line in the room. Before this row
      // existed, a worker that read three files looked identical to one that
      // answered cold — the only trace was a spend figure at the very end of a
      // run, attributable to nobody. The row is an action-stamped message like
      // the gate cards, with status "ran": rendered compact, no buttons, and
      // (deliberately) empty text so the hand-off selector — which requires
      // non-empty text — can never mistake a trace for the artifact.
      const trace = (name: string, input: Record<string, unknown>) =>
        set((s) => {
          const ch = s.channels[projectId];
          if (!ch) return {};
          return {
            channels: {
              ...s.channels,
              [projectId]: {
                ...ch,
                messages: [
                  ...ch.messages,
                  {
                    id: nextId(),
                    from: agentId,
                    text: "",
                    ...(opts?.node ? { node: opts.node } : {}),
                    action: { tool: name, input, status: "ran" as const },
                  },
                ],
              },
            },
          };
        });
      await runToolLoop({
        system,
        turns,
        tools: toolsFor(get().commitsArmed && getGhToken() !== null),
        model: modelForAgent(agentId),
        agentId,
        onDelta: (delta) => {
          if (needBreak) {
            acc += "\n\n";
            needBreak = false;
          }
          acc += delta;
          paint();
        },
        onModelCall: () => {
          modelCalls++;
        },
        execute: async (name, input) => {
          needBreak = acc.length > 0;
          if (GATED_TOOLS.has(name)) {
            proposed = true;
            let before: string | undefined;
            if (name === "propose_commit") {
              before = (await currentFile(projectId, String((input as { path?: string }).path ?? ""))).text;
            }
            set((s) => {
              const ch = s.channels[projectId];
              if (!ch) return {};
              return {
                channels: {
                  ...s.channels,
                  [projectId]: {
                    ...ch,
                    messages: [
                      ...ch.messages,
                      {
                        id: nextId(),
                        from: agentId,
                        text: "",
                        ...(opts?.node ? { node: opts.node } : {}),
                        action: { tool: name, input, status: "pending" as const, ...(before !== undefined ? { before } : {}) },
                      },
                    ],
                  },
                },
              };
            });
            // The proposal is a ledger row from the moment it is minted, not
            // only once resolved: a card the operator never clicks is still a
            // thing an agent asked for, and the 80-message chat window will
            // eventually forget it happened.
            appendJournal({
              kind: "gate",
              project: projectId,
              agent: agentId,
              tool: name,
              detail: String((input as { path?: string; name?: string }).path ?? (input as { name?: string }).name ?? "?"),
              outcome: "proposed",
            });
            return { gated: true };
          }
          // Every non-gated call below gets its row — the unknown-tool case
          // included, since its refusal still costs a follow-up model call and
          // an invisible cost is the exact thing this row exists to prevent.
          trace(name, input);
          if (name === "read_recent_commits") {
            const lines = await fetchRecentCommits(projectId);
            return { result: lines.join("\n") || "(no commits readable — repo missing or rate-limited)" };
          }
          if (name === "read_repo_file") {
            return { result: await readRepoFile(projectId, String((input as { path?: string }).path ?? "README.md")) };
          }
          if (name === "summon_agent") {
            const target = String((input as { agentId?: string }).agentId ?? "");
            if (get().agents.some((a) => a.id === target)) {
              get().assign(target, projectId);
              return { result: `summoned ${target} into the room (executed — reversible)` };
            }
            return { result: `unknown agent id "${target}"` };
          }
          return { result: `unknown tool ${name}` };
        },
      });
      set((s) => {
        const ch = s.channels[projectId];
        return {
          ...(ch
            ? {
                channels: {
                  ...s.channels,
                  [projectId]: {
                    ...ch,
                    messages:
                      acc.length === 0 && !proposed
                        ? ch.messages.filter((m) => m.id !== msgId)
                        : ch.messages.map((m) =>
                            m.id === msgId ? { ...m, text: m.text || "(proposed an action — see the card below)", streaming: false } : m
                          ),
                  },
                },
              }
            : {}),
          agents: s.agents.map((a) =>
            a.id === agentId && a.status.kind === "talking" ? { ...a, status: restingStatus(agentId, s.assignments) } : a
          ),
        };
      });
    } catch (err) {
      const note = err instanceof Error && /401|auth/i.test(err.message) ? "key rejected — check it in the brain menu" : "live brain error — falling back to silence";
      set((s) => {
        const ch = s.channels[projectId];
        return {
          ...(ch
            ? {
                channels: {
                  ...s.channels,
                  [projectId]: {
                    ...ch,
                    messages: ch.messages.map((m) => (m.id === msgId ? { ...m, text: m.text || `⚠ ${note}`, streaming: false } : m)),
                  },
                },
              }
            : {}),
          agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "error" as const, note } } : a)),
        };
      });
    } finally {
      // In the finally, not after the loop: a turn that threw part-way through
      // (a 401, a dropped stream) has already made the calls it made, and a run
      // that hides them under-reports the bill.
      if (opts?.spend) opts.spend.calls += modelCalls;
      liveStreams.delete(streamKey);
      releaseTurn();
    }
  },

  // Summon: bring an in-scope agent into the room (and onto the project).
  summon: (agentId, projectId) => get().assign(agentId, projectId),

  openChat: (agentId) => {
    const agent = get().agents.find((a) => a.id === agentId)!;
    set((s) => ({
      conversation: {
        id: nextId(),
        kind: "solo",
        participants: [agentId],
        topicId: s.assignments[agentId],
        messages: [],
        queue: [{ from: agentId, text: personaFor(agentId).open(s.assignments[agentId] ?? "the board") }],
      },
      focusRequest: s.stage.kind === "graph" ? { pos: agent.pos, seq: Math.random() } : s.focusRequest,
      agents: restTalking(s.agents, s.assignments, agentId).map((a) =>
        a.id === agentId ? { ...a, status: { kind: "talking" } } : a
      ),
    }));
  },

  closePanels: () =>
    set((s) => ({
      conversation: null,
      agents: s.agents.map((a) =>
        a.status.kind === "talking" ? { ...a, status: restingStatus(a.id, s.assignments) } : a
      ),
    })),

  sendUser: (text) => {
    const convo = get().conversation;
    if (!convo) return;
    // Live brain + solo DM → the agent answers for real.
    if (get().brainConnected && convo.kind === "solo") {
      set({
        conversation: { ...convo, messages: [...convo.messages, { id: nextId(), from: "user", text }] },
      });
      void get().streamDm(convo.participants[0]);
      return;
    }
    const acks = convo.participants.map((p) => ({
      from: p,
      text: convo.kind === "solo" ? personaFor(p).reply(text, convo.topicId) : personaFor(p).ack(text),
    }));
    set((s) => ({
      conversation: {
        ...convo,
        messages: [...convo.messages, { id: nextId(), from: "user", text }],
        queue: [...acks, ...convo.queue],
      },
      // an interjection wakes the participants back up — they're about to speak
      agents: s.agents.map((a) =>
        convo.participants.includes(a.id) ? { ...a, status: { kind: "talking" } } : a
      ),
    }));
  },

  // Leaving a room covers both cases: assigned crew (unassign handles the
  // participant list too) and drop-ins who arrived via mention or convene.
  removeFromRoom: (projectId, agentId) => {
    if (get().assignments[agentId] === projectId) {
      get().unassign(agentId);
      return;
    }
    set((s) => {
      const c = s.channels[projectId];
      if (!c) return {};
      return {
        channels: {
          ...s.channels,
          [projectId]: { ...c, ...departure(c, agentId) },
        },
      };
    });
  },

  // The operator's side of the gate: approving executes the proposal and Ops
  // announces it; dismissing just marks the card. The agent never self-approves.
  approveAction: (projectId, msgId) => {
    const ch = get().channels[projectId];
    const msg = ch?.messages.find((m) => m.id === msgId);
    if (!ch || !msg?.action || msg.action.status !== "pending") return;
    appendJournal({
      kind: "gate",
      project: projectId,
      agent: msg.from,
      tool: msg.action.tool,
      detail: String(
        (msg.action.input as { path?: string; name?: string }).path ?? (msg.action.input as { name?: string }).name ?? "?"
      ),
      outcome: "approved",
    });
    let announce = "";
    if (msg.action.tool === "propose_commit") {
      const inp = msg.action.input as { path?: string; content?: string; message?: string };
      // mark in-flight so a second click can't double-commit
      set((s) => {
        const c = s.channels[projectId];
        if (!c) return {};
        return {
          channels: {
            ...s.channels,
            [projectId]: {
              ...c,
              messages: c.messages.map((m) => (m.id === msgId ? { ...m, action: { ...m.action!, status: "approved" as const } } : m)),
            },
          },
        };
      });
      void (async () => {
        try {
          const out = await commitToBranch({
            repo: projectId,
            path: String(inp.path ?? ""),
            content: String(inp.content ?? ""),
            message: String(inp.message ?? "hub commit"),
            agentId: msg.from,
          });
          set((s) => {
            const c = s.channels[projectId];
            if (!c) return {};
            return {
              channels: {
                ...s.channels,
                [projectId]: {
                  ...c,
                  messages: [
                    ...c.messages,
                    { id: nextId(), from: "ops", text: `✓ operator approved — committed to branch ${out.branch}. Merging stays in GitHub: ${out.url}` },
                  ],
                },
              },
            };
          });
          appendJournal({
            kind: "commit",
            project: projectId,
            agent: msg.from,
            branch: out.branch,
            url: out.url,
            message: String(inp.message ?? "hub commit"),
          });
        } catch (e) {
          set((s) => {
            const c = s.channels[projectId];
            if (!c) return {};
            return {
              channels: {
                ...s.channels,
                [projectId]: {
                  ...c,
                  messages: [...c.messages, { id: nextId(), from: "ops", text: `⚠ commit refused: ${String(e).slice(0, 160)}` }],
                },
              },
            };
          });
          appendJournal({
            kind: "commit",
            project: projectId,
            agent: msg.from,
            branch: "",
            url: "",
            message: String(inp.message ?? "hub commit"),
            error: String(e).slice(0, 160),
          });
        }
      })();
      return;
    }
    if (msg.action.tool === "create_project") {
      const name = String((msg.action.input as { name?: string }).name ?? "untitled");
      const id = get().createProject(name);
      announce = `✓ operator approved — ${id} is on the board.`;
    }
    set((s) => {
      const c = s.channels[projectId];
      if (!c) return {};
      return {
        channels: {
          ...s.channels,
          [projectId]: {
            ...c,
            messages: [
              ...c.messages.map((m) => (m.id === msgId ? { ...m, action: { ...m.action!, status: "approved" as const } } : m)),
              ...(announce ? [{ id: nextId(), from: "ops", text: announce }] : []),
            ],
          },
        },
      };
    });
  },

  dismissAction: (projectId, msgId) => {
    // Read first so the ledger only records a REAL dismissal — the same
    // pending guard approveAction has, which a bare set() could not express.
    const msg = get().channels[projectId]?.messages.find((m) => m.id === msgId);
    if (msg?.action?.status === "pending") {
      appendJournal({
        kind: "gate",
        project: projectId,
        agent: msg.from,
        tool: msg.action.tool,
        detail: String(
          (msg.action.input as { path?: string; name?: string }).path ?? (msg.action.input as { name?: string }).name ?? "?"
        ),
        outcome: "dismissed",
      });
    }
    set((s) => {
      const c = s.channels[projectId];
      if (!c) return {};
      return {
        channels: {
          ...s.channels,
          [projectId]: {
            ...c,
            messages: c.messages.map((m) =>
              m.id === msgId && m.action ? { ...m, action: { ...m.action, status: "dismissed" as const } } : m
            ),
          },
        },
      };
    });
  },

  // Live DM: same read-only stream, scoped to the drawer conversation. If the
  // conversation changes mid-stream (closed, replaced), updates stop cleanly.
  streamDm: async (agentId) => {
    const streamKey = `dm:${agentId}`;
    // FAILURE MODE (same shape the channel path had): a bare
    // `if (liveStreams.has(key)) return` silently DROPS a message the operator
    // sent while the agent was still writing — the composer stays enabled for
    // exactly that, so the follow-up must queue behind the in-flight turn
    // rather than vanish. takeTurn serializes per agent; still one stream each.
    const releaseTurn = await takeTurn(streamKey);
    liveStreams.add(streamKey);
    const msgId = nextId();
    const convoId = get().conversation?.id;
    if (!convoId) {
      liveStreams.delete(streamKey);
      releaseTurn();
      return;
    }
    const patch = (fn: (c: Conversation) => Conversation) =>
      set((s) => (s.conversation && s.conversation.id === convoId ? { conversation: fn(s.conversation) } : {}));
    try {
      const { projects, assignments, conversation } = get();
      const topic = projects.find((p) => p.id === conversation?.topicId);
      const system = buildAgentSystem(
        agentId,
        topic,
        topic ? detailFor(topic.id) : undefined,
        topic ? get().repoWork[topic.id]?.issues?.items.map((i) => `#${i.number} ${i.title}`) : undefined
      );
      const turns = toTurns(conversation?.messages ?? [], agentId);
      patch((c) => ({ ...c, messages: [...c.messages, { id: msgId, from: agentId, text: "", streaming: true }] }));
      set((s) => ({
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "talking" as const } } : a)),
      }));
      let acc = "";
      for await (const delta of streamReply(system, turns, modelForAgent(agentId), agentId)) {
        acc += delta;
        const text = acc;
        patch((c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, text } : m)) }));
      }
      patch((c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, streaming: false } : m)) }));
      set((s) => ({
        agents: s.agents.map((a) =>
          a.id === agentId && a.status.kind === "talking" ? { ...a, status: restingStatus(agentId, s.assignments) } : a
        ),
      }));
    } catch {
      patch((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, text: m.text || "⚠ live brain error — check the key in the brain menu", streaming: false } : m
        ),
      }));
      set((s) => ({
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "error" as const, note: "live brain error" } } : a)),
      }));
    } finally {
      liveStreams.delete(streamKey);
      releaseTurn();
    }
  },

  advance: () => {
    const convo = get().conversation;
    if (!convo || convo.queue.length === 0) return;
    const [next, ...rest] = convo.queue;
    set((s) => ({
      conversation: {
        ...convo,
        messages: [...convo.messages, { id: nextId(), from: next.from, text: next.text }],
        queue: rest,
      },
      agents:
        rest.length === 0
          ? s.agents.map((a) =>
              convo.participants.includes(a.id) && a.status.kind === "talking"
                ? { ...a, status: restingStatus(a.id, s.assignments) }
                : a
            )
          : s.agents,
    }));
  },

  toggleTray: (agentId) =>
    set((s) => ({
      tray: s.tray.includes(agentId) ? s.tray.filter((t) => t !== agentId) : [...s.tray, agentId],
    })),

  convene: () => {
    const { tray, assignments, projects, channels } = get();
    if (tray.length < 2) return;
    const topicId =
      tray.map((t) => assignments[t]).find(Boolean) ?? projects[Math.floor(Math.random() * projects.length)].id;
    const topic = projects.find((p) => p.id === topicId)!;
    const existing = channels[topicId] ?? { participants: [], messages: [], queue: [] };
    // union with the project's assigned crew and scoped residents — convening
    // must never lock them out of their own room (critic finding)
    const resident = get()
      .agents.filter((a) => assignments[a.id] === topicId || (a.scope !== "global" && a.scope.projectId === topicId))
      .map((a) => a.id);
    const participants = Array.from(new Set([...existing.participants, ...resident, ...tray]));
    set({
      tray: [],
      conversation: null,
      stage: { kind: "project", id: topicId },
      projectMode: "work",
      channels: {
        ...channels,
        [topicId]: { ...existing, participants, queue: [...existing.queue, ...buildRoundtable(tray, topic.name)] },
      },
      agents: restTalking(get().agents, assignments),
    });
  },

  clearTray: () => set({ tray: [] }),

  // Change-detected: a tick where nothing moves returns the SAME agents array,
  // so subscribers (and React Flow) see no update — critic finding.
  tick: () =>
    set((s) => {
      let changed = false;
      const next = s.agents.map((a) => {
        if (a.status.kind === "talking") return a;
        if (a.status.kind === "error") {
          if (Math.random() < 0.5) {
            changed = true;
            return { ...a, status: restingStatus(a.id, s.assignments) };
          }
          return a;
        }
        if (a.status.kind === "working") {
          if (Math.random() < 0.05) {
            changed = true;
            return { ...a, status: { kind: "error" as const, note: ERRORS[Math.floor(Math.random() * ERRORS.length)] } };
          }
          return a;
        }
        if (a.status.kind === "idle" && Math.random() < 0.28) {
          changed = true;
          const pool = personaFor(a.id).musings;
          return { ...a, status: { kind: "thinking" as const, note: pool[Math.floor(Math.random() * pool.length)] } };
        }
        if (a.status.kind === "thinking" && Math.random() < 0.45) {
          changed = true;
          return { ...a, status: { kind: "idle" as const } };
        }
        return a;
      });
      return changed ? { agents: next } : {};
    }),

  assign: (agentId, projectId) =>
    set((s) => {
      const channel = s.channels[projectId];
      const project = s.projects.find((p) => p.id === projectId)!;
      return {
        assignments: { ...s.assignments, [agentId]: projectId },
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "working", projectId } } : a)),
        channels: channel
          ? {
              ...s.channels,
              [projectId]: {
                ...channel,
                participants: Array.from(new Set([...channel.participants, agentId])),
                queue: [...channel.queue, { from: agentId, text: personaFor(agentId).open(project.name) }],
              },
            }
          : s.channels,
      };
    }),

  unassign: (agentId) =>
    set((s) => {
      const { [agentId]: room, ...rest } = s.assignments;
      // a released agent leaves the room too — otherwise it haunts the
      // participant list forever and keeps answering (critic finding).
      // FAILURE MODE (collateral eviction): this used to sweep the agent out of
      // EVERY channel, so releasing them from one project also silently kicked
      // them out of every other room they had been mentioned or convened into.
      // Only the room implied by the assignment is affected; the explicit-room
      // case belongs to removeFromRoom.
      const ch = room ? s.channels[room] : undefined;
      const channels =
        room && ch
          ? { ...s.channels, [room]: { ...ch, ...departure(ch, agentId) } }
          : s.channels;
      return {
        assignments: rest,
        channels,
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "idle" } } : a)),
      };
    }),
    }),
    {
      name: "agent-hub:state",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name: string) => localStorage.getItem(name),
        // While adopting another tab's state, this tab must not write back its
        // stale snapshot — that is how an approved gate card reverted.
        setItem: (name: string, value: string) => {
          if (adoptingExternal) return;
          localStorage.setItem(name, value);
        },
        removeItem: (name: string) => localStorage.removeItem(name),
      })),
      // What survives a tab: rooms (cards included), assignments, projects the
      // operator created, and where every node was dragged. Streaming flags are
      // scrubbed so a closed tab can't leave a message writing forever.
      partialize: (s) => ({
        channels: Object.fromEntries(
          Object.entries(s.channels).map(([pid, ch]) => [
            pid,
            {
              participants: ch.participants,
              queue: ch.queue,
              messages: ch.messages.slice(-80).map((m) => (m.streaming ? { ...m, streaming: false } : m)),
            },
          ])
        ),
        assignments: s.assignments,
        mapLocked: s.mapLocked,
        extraProjects: s.projects.filter((p) => !SEED_PROJECT_IDS.has(p.id)).map((p) => ({ ...p, liveActivity: undefined })),
        positions: Object.fromEntries([...s.projects, ...s.agents].map((x) => [x.id, x.pos])),
      }),
      // A rehydrate triggered by another tab's write must not immediately be
      // overwritten by this tab's older snapshot — skip one write cycle.
      merge: (persistedRaw, current) => {
        const p = (persistedRaw ?? {}) as {
          channels?: Record<string, Channel>;
          assignments?: Record<string, string>;
          mapLocked?: boolean;
          extraProjects?: Project[];
          positions?: Record<string, Vec>;
        };
        const pos = p.positions ?? {};
        const assignments = p.assignments ?? current.assignments;
        // FAILURE MODE (unbounded duplication): merge's 2nd arg is the LIVE
        // state, not the initial state — on every rehydrate (and the cross-tab
        // storage listener rehydrates on each foreign write, while each streamed
        // token triggers a persist) current.projects ALREADY contains the
        // extraProjects merged last time. Blind-concatenating them re-added a
        // copy per rehydrate: 1, 2, 3, … Merge by id instead, persisted wins.
        const byId = new Map<string, Project>();
        for (const pr of current.projects) byId.set(pr.id, pr);
        for (const ex of p.extraProjects ?? []) byId.set(ex.id, { ...byId.get(ex.id), ...ex });
        const projects = Array.from(byId.values(), (pr) => (pos[pr.id] ? { ...pr, pos: pos[pr.id] } : pr));
        return {
          ...current,
          channels: p.channels ?? current.channels,
          assignments,
          mapLocked: p.mapLocked ?? current.mapLocked,
          projects,
          agents: current.agents.map((a) => ({
            ...a,
            ...(pos[a.id] ? { pos: pos[a.id] } : {}),
            status: assignments[a.id] ? { kind: "working" as const, projectId: assignments[a.id] } : { kind: "idle" as const },
          })),
        };
      },
    }
  )
);
