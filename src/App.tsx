import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import Particles from "./components/Particles";
import Sidebar from "./components/Sidebar";
import MissionControl from "./components/MissionControl";
import HubCanvas from "./components/HubCanvas";
import HUD from "./components/HUD";
import ProjectStage from "./components/stage/ProjectStage";
import ChatPanel from "./components/panels/ChatPanel";
import { useHub } from "./state/hub";

export default function App() {
  const stage = useHub((s) => s.stage);
  const tick = useHub((s) => s.tick);
  const closePanels = useHub((s) => s.closePanels);
  const backToGraph = useHub((s) => s.backToGraph);
  const hasDm = useHub((s) => s.conversation !== null);

  useEffect(() => {
    const t = setInterval(tick, 4200);
    return () => clearInterval(t);
  }, [tick]);

  // Deep-link: #/p/<projectId> opens that project; #/p/<id>/work lands in work mode.
  useEffect(() => {
    const applyHash = () => {
      const m = location.hash.match(/^#\/p\/([\w-]+)(\/work)?$/);
      if (m) {
        useHub.getState().openStage(m[1]);
        if (m[2]) useHub.getState().setProjectMode("work");
      }
    };
    applyHash();
    addEventListener("hashchange", applyHash);
    return () => removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // typing in an input? Escape belongs to the field (clear/blur), not navigation
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        t.blur();
        return;
      }
      const s = useHub.getState();
      if (s.conversation) s.closePanels();
      else if (s.tray.length > 0) s.clearTray();
      else if (s.stage.kind === "project") s.backToGraph();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [closePanels, backToGraph]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="vignette relative flex h-screen w-screen overflow-hidden">
      <Particles />
      <Sidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col">
      <MissionControl />
      <main className="relative min-h-0 min-w-0 flex-1">
        <ReactFlowProvider>
          {/* The constellation stays mounted so positions & camera survive stage
              trips. opacity-0, not invisible: React Flow sets inline
              visibility:visible on measured nodes, which pierces `invisible`.
              `inert` (set via ref — React 18's types lack the attribute) drops
              its ~58 focusables out of the tab order while hidden. */}
          <div
            aria-hidden={stage.kind !== "graph"}
            ref={(el) => {
              if (el) el.inert = stage.kind !== "graph";
            }}
            className={stage.kind === "graph" ? "h-full w-full" : "pointer-events-none h-full w-full opacity-0"}
          >
            <HubCanvas />
            <HUD />
          </div>
          {/* No AnimatePresence here: a descendant's infinite float kept the
              exit from ever completing, leaving an invisible click-eating
              overlay on the constellation (critic-adjacent find). Unmount is
              instant; the stage still animates IN via its own motion.div. */}
          {stage.kind === "project" && (
              <div className="absolute inset-0">
                <ProjectStage key={stage.id} projectId={stage.id} />
              </div>
            )}
          <AnimatePresence>{hasDm && <ChatPanel key="dm" />}</AnimatePresence>
        </ReactFlowProvider>
      </main>
      </div>
    </div>
    </MotionConfig>
  );
}
