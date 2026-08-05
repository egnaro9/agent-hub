import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Sidebar from "./components/Sidebar";
import MissionControl from "./components/MissionControl";
import GalaxyCanvas from "./components/GalaxyCanvas";
import ProjectStage from "./components/stage/ProjectStage";
import ChatPanel from "./components/panels/ChatPanel";
import { useHub } from "./state/hub";
import { PHONE_QUERY, useMediaQuery } from "./hooks/useMediaQuery";

export default function App() {
  const stage = useHub((s) => s.stage);
  const tick = useHub((s) => s.tick);
  const closePanels = useHub((s) => s.closePanels);
  const backToGraph = useHub((s) => s.backToGraph);
  const hasDm = useHub((s) => s.conversation !== null);

  // Phone: the rail becomes a drawer. The open flag lives here and not in the
  // store because it is chrome, not hub state — nothing else may react to it,
  // and it must not persist. The ref mirror lets the long-lived Escape handler
  // below read it without re-subscribing on every open/close.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [navOpen, setNavOpen] = useState(false);
  const navOpenRef = useRef(navOpen);
  navOpenRef.current = navOpen;

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
      } else if (location.hash === "" || location.hash === "#") {
        if (useHub.getState().stage.kind !== "graph") useHub.getState().backToGraph();
      }
    };
    applyHash();
    addEventListener("hashchange", applyHash);
    return () => removeEventListener("hashchange", applyHash);
  }, []);

  // URL ⇄ stage, both directions: navigation writes the hash (so refresh and
  // Back work), and hash edits/Back drive the stage. The first invocation is
  // skipped — at boot the URL is the source of truth, and writing before the
  // deep-link effect has read it wipes the hash (StrictMode made this bite).
  const projectMode = useHub((s) => s.projectMode);
  const hashSyncArmed = useRef(false);
  useEffect(() => {
    if (!hashSyncArmed.current) {
      hashSyncArmed.current = true;
      return;
    }
    const want = stage.kind === "project" ? `#/p/${stage.id}${projectMode === "work" ? "/work" : ""}` : "#";
    if (location.hash !== want && !(want === "#" && location.hash === "")) {
      history.pushState(null, "", want === "#" ? location.pathname : want);
    }
  }, [stage, projectMode]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // typing in an input? Escape belongs to the field (clear/blur), not navigation
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        t.blur();
        return;
      }
      // The drawer is the topmost chrome when open, so it claims Escape first.
      if (navOpenRef.current) {
        setNavOpen(false);
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
      {/* Phone swaps the static rail for a drawer. This is a JS swap, not a
          CSS hide: two mounted Sidebars would mean two #hub-search ids and
          the second silently unreachable by getElementById. */}
      {!isPhone && <Sidebar />}
      <div className="flex h-full min-w-0 flex-1 flex-col">
      <MissionControl onMenu={isPhone ? () => setNavOpen(true) : undefined} />
      <main className="relative min-h-0 min-w-0 flex-1">
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
            <GalaxyCanvas />
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
      </main>
      </div>

      {/* Phone nav drawer: the whole Sidebar, slid in over everything. The
          scrim is a real element (not a backdrop-filter — that doesn't sample
          across the RF/framer stacking contexts) and tapping it, Escape, or
          navigating anywhere closes the drawer. The Sidebar itself is opaque
          #070b17, so the canvas can't bleed through the list. */}
      {isPhone && (
        <AnimatePresence>
          {navOpen && (
            <>
              <motion.div
                key="nav-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setNavOpen(false)}
                aria-hidden
                className="fixed inset-0 z-40 bg-black/60"
              />
              <motion.div
                key="nav-drawer"
                initial={{ x: -264 }}
                animate={{ x: 0 }}
                exit={{ x: -264 }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="panel-solid fixed inset-y-0 left-0 z-50"
              >
                <Sidebar onNavigate={() => setNavOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
    </MotionConfig>
  );
}
