import { create } from "zustand";
import type { Agent, Conversation, Message, Project, QueuedLine, StructuralEdge, Vec } from "../types";
import { AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS } from "../data/mock";
import { personaFor, ERRORS, buildRoundtable, nextId } from "../sim/lines";
import { fetchRecentCommits } from "../data/github";

export type Stage = { kind: "graph" } | { kind: "project"; id: string };
export type ProjectMode = "overview" | "work";

export interface Channel {
  participants: string[];
  messages: Message[];
  queue: QueuedLine[];
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
  focusRequest: { pos: Vec; seq: number } | null;
  createProject: (name: string) => string;
  hydrateActivity: (projectId: string) => Promise<void>;

  moveNode: (id: string, pos: Vec) => void;
  openStage: (projectId: string) => void;
  backToGraph: () => void;
  setProjectMode: (m: ProjectMode) => void;
  toggleRoomDrawer: () => void;
  toggleStar: (projectId: string) => void;
  setSearch: (q: string) => void;
  advanceChannel: (projectId: string) => void;
  sendToChannel: (projectId: string, text: string) => void;
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

// One hydration attempt per project per session — success or failure, we don't
// hammer an unauthenticated API that rate-limits at 60/hr.
const hydrationAttempted = new Set<string>();

// Critic finding: every path that drops a conversation must rest its speakers,
// or agents stay "talking" forever and the tick loop can never rescue them.
const restTalking = (agents: Agent[], assignments: Record<string, string>, except?: string) =>
  agents.map((a) =>
    a.id !== except && a.status.kind === "talking" ? { ...a, status: restingStatus(a.id, assignments) } : a
  );

export const useHub = create<HubState>()((set, get) => ({
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
  },

  hydrateActivity: async (projectId) => {
    if (hydrationAttempted.has(projectId)) return;
    hydrationAttempted.add(projectId);
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
    // "run the sweep" in the harness-builder room replays the real result.
    if (projectId === "harness-builder" && /run .*sweep/i.test(text)) {
      const sweep: QueuedLine[] = [
        { from: "oracle", text: "Sweep armed: 3 harness shapes × 20 tasks, deterministic graders, mock provider. Running…" },
        { from: "oracle", text: "one drafter — 95% · $0.031 · 2.2s/task. planner→drafter — 90% · $0.264. planner→2 drafters→judge — 80% · $0.692." },
        { from: "oracle", text: "17 of 20 tasks tied. Four discordant pairs cannot clear p<0.05 — this suite cannot decide between them. That is a limit of the suite, not a finding about the harnesses." },
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
      }));
      return;
    }

    // "new project: <name>" mints a node in the constellation, live.
    const create = text.match(/^\/?new project:?\s+(.{2,40})$/i);
    if (create) {
      const id = get().createProject(create[1]);
      set((s) => {
        const ch = s.channels[projectId]!;
        return {
          channels: {
            ...s.channels,
            [projectId]: {
              ...ch,
              messages: [...ch.messages, { id: nextId(), from: "user", text }],
              queue: [
                { from: ch.participants[0] ?? "strat", text: `Done — ${id} is on the board. It has no CI, no claims, and no crew yet: exactly how every honest project starts.` },
                ...ch.queue,
              ],
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
    } else {
      responders = participants.slice(0, 3);
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
    }));
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
    const participants = Array.from(new Set([...existing.participants, ...tray]));
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
      const { [agentId]: _, ...rest } = s.assignments;
      return {
        assignments: rest,
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "idle" } } : a)),
      };
    }),
}));
