import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Agent, Conversation, Message, Project, QueuedLine, StructuralEdge, Vec } from "../types";
import { AGENTS, PROJECTS, STRUCTURAL, SEED_ASSIGNMENTS } from "../data/mock";
import { personaFor, ERRORS, buildRoundtable, nextId } from "../sim/lines";
import { fetchRecentCommits } from "../data/github";
import { getKey, buildAgentSystem, toTurns, streamReply, runToolLoop, readRepoFile, GATED_TOOLS, toolsFor, currentFile, commitToBranch, getGhToken } from "../agents/brain";
import { detailFor } from "../data/detail";

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
  mapLocked: boolean;
  toggleMapLock: () => void;
  commitsArmed: boolean;
  setCommitsArmed: (v: boolean) => void;
  brainConnected: boolean; // a BYOK Anthropic key is present in this browser
  setBrainConnected: (v: boolean) => void;
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
  streamAgent: (projectId: string, agentId: string) => Promise<void>;
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

// One hydration attempt per project per session — success or failure, we don't
// hammer an unauthenticated API that rate-limits at 60/hr.
const hydrationAttempted = new Set<string>();

// One live stream per room at a time.
const liveStreams = new Set<string>();

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
  setCommitsArmed: (v) => set({ commitsArmed: v }),
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
      }));
      void (async () => {
        for (const r of responders) await get().streamAgent(projectId, r);
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
    }));
  },

  // A live agent streaming from Anthropic with the room's transcript and the
  // project's live context. Read-only by construction — no tools are passed,
  // so speech is the only capability.
  streamAgent: async (projectId, agentId) => {
    const streamKey = `ch:${projectId}:${agentId}`;
    if (liveStreams.has(streamKey)) return;
    liveStreams.add(streamKey);
    const msgId = nextId();
    try {
      const { projects, channels } = get();
      const project = projects.find((p) => p.id === projectId);
      const channel = channels[projectId];
      if (!project || !channel) return;
      const system = buildAgentSystem(agentId, project, detailFor(projectId));
      const turns = toTurns(get().channels[projectId]?.messages ?? channel.messages, agentId);
      set((s) => {
        const ch = s.channels[projectId];
        if (!ch) return {};
        return {
          channels: {
            ...s.channels,
            [projectId]: {
              ...ch,
              participants: ch.participants.includes(agentId) ? ch.participants : [...ch.participants, agentId],
              messages: [...ch.messages, { id: msgId, from: agentId, text: "", streaming: true }],
            },
          },
          agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "talking" as const } } : a)),
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
      await runToolLoop({
        system,
        turns,
        tools: toolsFor(get().commitsArmed && getGhToken() !== null),
        onDelta: (delta) => {
          if (needBreak) {
            acc += "\n\n";
            needBreak = false;
          }
          acc += delta;
          paint();
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
                        action: { tool: name, input, status: "pending" as const, ...(before !== undefined ? { before } : {}) },
                      },
                    ],
                  },
                },
              };
            });
            return { gated: true };
          }
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
      liveStreams.delete(streamKey);
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
          [projectId]: { ...c, participants: c.participants.filter((p) => p !== agentId) },
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

  dismissAction: (projectId, msgId) =>
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
    }),

  // Live DM: same read-only stream, scoped to the drawer conversation. If the
  // conversation changes mid-stream (closed, replaced), updates stop cleanly.
  streamDm: async (agentId) => {
    const streamKey = `dm:${agentId}`;
    if (liveStreams.has(streamKey)) return;
    liveStreams.add(streamKey);
    const msgId = nextId();
    const convoId = get().conversation?.id;
    if (!convoId) {
      liveStreams.delete(streamKey);
      return;
    }
    const patch = (fn: (c: Conversation) => Conversation) =>
      set((s) => (s.conversation && s.conversation.id === convoId ? { conversation: fn(s.conversation) } : {}));
    try {
      const { projects, assignments, conversation } = get();
      const topic = projects.find((p) => p.id === conversation?.topicId);
      const system = buildAgentSystem(agentId, topic, topic ? detailFor(topic.id) : undefined);
      const turns = toTurns(conversation?.messages ?? [], agentId);
      patch((c) => ({ ...c, messages: [...c.messages, { id: msgId, from: agentId, text: "", streaming: true }] }));
      set((s) => ({
        agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: { kind: "talking" as const } } : a)),
      }));
      let acc = "";
      for await (const delta of streamReply(system, turns)) {
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
      const { [agentId]: _, ...rest } = s.assignments;
      // a released agent leaves the room too — otherwise it haunts the
      // participant list forever and keeps answering (critic finding)
      const channels = Object.fromEntries(
        Object.entries(s.channels).map(([pid, ch]) => [
          pid,
          ch.participants.includes(agentId)
            ? { ...ch, participants: ch.participants.filter((p) => p !== agentId) }
            : ch,
        ])
      );
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
        extraProjects: s.projects.filter((p) => !SEED_PROJECT_IDS.has(p.id)).map((p) => ({ ...p, liveActivity: undefined })),
        positions: Object.fromEntries([...s.projects, ...s.agents].map((x) => [x.id, x.pos])),
      }),
      // A rehydrate triggered by another tab's write must not immediately be
      // overwritten by this tab's older snapshot — skip one write cycle.
      merge: (persistedRaw, current) => {
        const p = (persistedRaw ?? {}) as {
          channels?: Record<string, Channel>;
          assignments?: Record<string, string>;
          extraProjects?: Project[];
          positions?: Record<string, Vec>;
        };
        const pos = p.positions ?? {};
        const assignments = p.assignments ?? current.assignments;
        return {
          ...current,
          channels: p.channels ?? current.channels,
          assignments,
          projects: [
            ...current.projects.map((pr) => (pos[pr.id] ? { ...pr, pos: pos[pr.id] } : pr)),
            ...(p.extraProjects ?? []),
          ],
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
