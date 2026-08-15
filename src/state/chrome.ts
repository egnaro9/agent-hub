import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/* Operator chrome preferences — which pieces of UI furniture are open.
   Deliberately OUTSIDE the hub store: collapsing the top bar is not hub
   state, nothing simulates against it, and it must survive reloads without
   riding along in the hub snapshot. Everything defaults OPEN.

   SESSION-scoped (operator call, 2026-08-15): a fold sticks through reloads
   of THIS tab, but a fresh visit always opens the full face. Persisted
   forever, one idle collapse silently became the permanent default — "once
   minimized, forevermore closed" was the review note. Same rule as the play
   page's mute: a choice is for the session, the default is for the house. */

export type ChromeKey =
  | "sidebar" | "sbHeader" | "sbProjects" | "sbAgents" | "topBar" | "hud"
  | "wkTasks" | "wkFiles" | "wkGate" | "wkTopology";

interface ChromeState {
  sidebar: boolean;    // the whole navigation rail
  sbHeader: boolean;   // rail: brand block
  sbProjects: boolean; // rail: project list
  sbAgents: boolean;   // rail: agent list
  topBar: boolean;     // mission-control strip
  hud: boolean;        // galaxy zoom/mode cluster
  wkTasks: boolean;    // work mode: tasks card
  wkFiles: boolean;    // work mode: files card
  wkGate: boolean;     // work mode: gate-ops card
  wkTopology: boolean; // work mode: shape launcher bar
  toggle: (k: ChromeKey) => void;
}

export const useChrome = create<ChromeState>()(
  persist(
    (set) => ({
      sidebar: true,
      sbHeader: true,
      sbProjects: true,
      sbAgents: true,
      topBar: true,
      hud: true,
      wkTasks: true,
      wkFiles: true,
      wkGate: true,
      wkTopology: true,
      toggle: (k) => set((s) => ({ [k]: !s[k] })),
    }),
    { name: "agent-hub:chrome", storage: createJSONStorage(() => sessionStorage) }
  )
);
