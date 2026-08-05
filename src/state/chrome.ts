import { create } from "zustand";
import { persist } from "zustand/middleware";

/* Operator chrome preferences — which pieces of UI furniture are open.
   Deliberately OUTSIDE the hub store: collapsing the top bar is not hub
   state, nothing simulates against it, and it must survive reloads without
   riding along in the hub snapshot. Everything defaults OPEN. */

export type ChromeKey = "sidebar" | "sbHeader" | "sbProjects" | "sbAgents" | "topBar" | "hud";

interface ChromeState {
  sidebar: boolean;    // the whole navigation rail
  sbHeader: boolean;   // rail: brand block
  sbProjects: boolean; // rail: project list
  sbAgents: boolean;   // rail: agent list
  topBar: boolean;     // mission-control strip
  hud: boolean;        // galaxy zoom/mode cluster
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
      toggle: (k) => set((s) => ({ [k]: !s[k] })),
    }),
    { name: "agent-hub:chrome" }
  )
);
