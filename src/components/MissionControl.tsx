import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub, agentInScope } from "../state/hub";
import { useChrome } from "../state/chrome";
import { getKey, setKey, clearKey, getModel, setModel, BRAIN_MODELS, getGhToken, setGhToken, clearGhToken, getRouting, setRouting } from "../agents/brain";
import RosterPanel from "./RosterPanel";
import ProvidersPanel from "./ProvidersPanel";
import JournalPanel from "./JournalPanel";
import Tutorial from "./Tutorial";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { SCALES, useUiScale } from "../hooks/useUiScale";

// "claude-haiku-4-5" → "haiku-4-5"; anything long gets clipped so the bar never blows out.
const shortModel = (id: string) => {
  const s = id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
};

// The thin command strip over the stage: where you are, who's active, summon.
// `onMenu` arrives only on phone (App wires it below sm): it opens the nav
// drawer, and its presence is also what puts the hamburger in the strip.
export default function MissionControl({ onMenu }: { onMenu?: () => void }) {
  const stage = useHub((s) => s.stage);
  const projects = useHub((s) => s.projects);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const projectMode = useHub((s) => s.projectMode);
  const setProjectMode = useHub((s) => s.setProjectMode);
  const backToGraph = useHub((s) => s.backToGraph);
  const requestPlanet = useHub((s) => s.requestPlanet);
  const summon = useHub((s) => s.summon);
  const brainConnected = useHub((s) => s.brainConnected);
  const setBrainConnected = useHub((s) => s.setBrainConnected);
  const [summonOpen, setSummonOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState(getModel());
  const [ghDraft, setGhDraft] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [uiScale, setScale] = useUiScale();
  const [routing, setRoutingState] = useState(getRouting());
  const [activeModel, setActiveModel] = useState(getModel());
  const commitsArmed = useHub((s) => s.commitsArmed);
  const setCommitsArmed = useHub((s) => s.setCommitsArmed);
  // Below sm the strip condenses: summon/roster/keys/brain/search collapse
  // into one ⋯ menu. Same popover discipline as everything else in the strip.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [moreOpen, setMoreOpen] = useState(false);
  const summonRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const anyOpen = summonOpen || brainOpen || keysOpen || moreOpen;

  // One handler for both popovers: click outside dismisses, Escape dismisses the whole stack.
  useEffect(() => {
    if (!anyOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (summonRef.current && !summonRef.current.contains(t)) setSummonOpen(false);
      if (brainRef.current && !brainRef.current.contains(t)) setBrainOpen(false);
      if (keysRef.current && !keysRef.current.contains(t)) setKeysOpen(false);
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSummonOpen(false);
      setBrainOpen(false);
      setDangerOpen(false);
      setKeysOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anyOpen]);

  // Navigating away should never leave a menu floating over the new stage.
  useEffect(() => {
    setSummonOpen(false);
    setBrainOpen(false);
    setDangerOpen(false);
    setRosterOpen(false);
    setKeysOpen(false);
    setMoreOpen(false);
  }, [stage]);

  const project = stage.kind === "project" ? projects.find((p) => p.id === stage.id) : undefined;
  const active = agents.filter((a) => a.status.kind === "working" || a.status.kind === "talking").length;
  const errored = agents.filter((a) => a.status.kind === "error").length;
  const summonable = project
    ? agents.filter((a) => agentInScope(a, project.id) && assignments[a.id] !== project.id)
    : [];

  // Shared by the desktop chip and the phone menu row, so both reset the
  // drafts the same way — a stale key draft must never survive a reopen.
  const toggleBrain = () => {
    setBrainOpen((v) => !v);
    setKeyDraft("");
    setModelDraft(getModel());
    setActiveModel(getModel());
  };

  // The popovers, shared verbatim by the desktop strip and the phone ⋯ menu —
  // each renders inside a `relative` wrapper carrying its outside-click ref,
  // so whichever surface mounts it gets the same dismiss behavior for free.
  const summonPopover = (
    <AnimatePresence>
      {summonOpen && project && summonable.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className="glass absolute top-9 right-0 w-52 overflow-hidden rounded-xl p-1"
        >
          {summonable.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                summon(a.id, project.id);
                setSummonOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/8"
            >
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
              <span className="min-w-0">
                <span className="block text-[11.5px] text-slate-200">{a.name}</span>
                <span className="mono block truncate text-[8.5px] text-slate-400">{a.role}</span>
              </span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative z-30 flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/8 bg-[#070b17]/90 px-4 py-1 backdrop-blur">
      {/* phone: the rail lives behind this hamburger (App owns the drawer) */}
      {isPhone && onMenu && (
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="mono -ml-2 grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-md text-[15px] text-slate-300 transition hover:bg-white/10"
        >
          ☰
        </button>
      )}
      {/* location — the crumb starts one level ABOVE the app: the portfolio
          hub is the estate's root, so the way back out is always in view.
          The hub crumb dresses as a BUTTON (the estate's pill pattern), not
          dim text — "not very obvious that that's what takes you back" was
          the operator's exact review note. */}
      <a
        href="https://egnaro9.github.io/"
        title="Back to the portfolio hub"
        className="mono cursor-pointer rounded-md border border-amber-400/50 bg-amber-400/15 px-3 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-400/25 hover:text-amber-200"
      >
        ← hub
      </a>
      <span className="mono text-[11px] text-slate-700">/</span>
      <button onClick={backToGraph} className={`mono cursor-pointer text-[11px] transition ${project ? "text-slate-500 hover:text-slate-300" : "text-slate-200"}`}>
        constellation
      </button>
      {project && (
        <>
          <span className="mono text-[11px] text-slate-700">/</span>
          {/* The name is the way BACK TO THE PLANET. Inside a project the only
              exit used to be "galaxy", which returns to the wide map — there
              was no route to the world's own card, the front door you arrived
              through. The breadcrumb already reads galaxy / project / mode, so
              the middle rung is exactly where that belongs. */}
          <button
            onClick={() => {
              backToGraph();
              requestPlanet(project.id);
            }}
            title={`Back to ${project.name}'s world`}
            aria-label={`Back to ${project.name}'s world`}
            className="mono flex min-w-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-100 transition hover:text-white"
          >
            <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: project.hue, boxShadow: `0 0 6px ${project.hue}` }} />
            {/* phone-only cap: a long project name must not shove the mode
                tabs off the strip. Desktop keeps the full name, unclipped. */}
            <span className={isPhone ? "max-w-[8.5rem] truncate" : ""}>{project.name}</span>
          </button>
          <div className="ml-2 flex overflow-hidden rounded-md border border-white/10">
            {(["overview", "work"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setProjectMode(m)}
                className={`mono cursor-pointer px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
                  projectMode === m ? "bg-cyan-400/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* fleet status */}
      <span className="mono hidden text-[10px] text-slate-400 lg:inline">
        <span className="text-teal-300">{active}</span> active
        {errored > 0 && (
          <>
            {" · "}
            <span className="text-rose-400">{errored} error</span>
          </>
        )}
        {" · "}
        {agents.length} agents
      </span>

      {/* summon — on phone the chip hides and the wrapper parks at the strip's
          right edge, so the popover the ⋯ menu opens still drops from the bar */}
      <div ref={summonRef} className="relative max-sm:absolute max-sm:top-1 max-sm:right-2">
        <button
          onClick={() => setSummonOpen((v) => !v)}
          disabled={!project || summonable.length === 0}
          className="mono cursor-pointer rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-slate-200 transition max-sm:hidden hover:bg-white/20 hover:text-white disabled:cursor-default disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500 disabled:hover:bg-white/5"
          title={project ? "Summon an agent onto this project" : "Select a project first"}
        >
          + summon agent
        </button>
        {summonPopover}
      </div>

      {/* per-agent brains — the max-sm scale squeezes the fixed 25rem panel
          inside a 390px viewport without touching RosterPanel itself */}
      <div className="relative max-sm:absolute max-sm:top-1 max-sm:right-2 max-sm:origin-top-right max-sm:scale-[0.93]">
        <button
          onClick={() => setRosterOpen((v) => !v)}
          className="mono cursor-pointer rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-slate-300 transition max-sm:hidden hover:text-slate-200"
          title="Choose the provider and model for each agent"
        >
          ⚙ roster
        </button>
        {rosterOpen && <RosterPanel onClose={() => setRosterOpen(false)} />}
      </div>

      {/* text size — the app's OWN magnification. Cycles 100 → 110 → 120 →
          130 → 100. Browser page-zoom would do this too, except it shrinks the
          CSS viewport and drops a desktop operator into the phone layout;
          zooming #root leaves every media query reading the real window. */}
      <button
        data-testid="ui-scale"
        onClick={() => setScale(SCALES[(SCALES.indexOf(uiScale) + 1) % SCALES.length])}
        className={`mono cursor-pointer rounded-md border px-2.5 py-1 text-[10px] whitespace-nowrap transition max-sm:hidden ${
          uiScale > 1
            ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/25"
            : "border-white/20 bg-white/10 text-slate-300 hover:text-slate-100"
        }`}
        title="Text size — scales the console without changing the layout the way browser zoom does"
      >
        ⌗ text {Math.round(uiScale * 100)}%
      </button>

      {/* operator journal — the ledger the 80-message chat window can't erase.
          A portalled modal, so no parked wrapper is needed; the button just
          opens it. */}
      <button
        data-testid="journal-button"
        onClick={() => setJournalOpen(true)}
        className="mono cursor-pointer rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-slate-300 transition max-sm:hidden hover:text-slate-200"
        title="Gate proposals, commits, shape runs and armings — the record that outlives the chat"
      >
        ▤ journal
      </button>
      {journalOpen && <JournalPanel onClose={() => setJournalOpen(false)} />}

      {/* provider credentials — one key per provider, plus an honest reachability probe */}
      <div ref={keysRef} className="relative max-sm:absolute max-sm:top-1 max-sm:right-2 max-sm:origin-top-right max-sm:scale-[0.93]">
        <button
          data-testid="keys-button"
          onClick={() => setKeysOpen((v) => !v)}
          className="mono cursor-pointer rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-slate-300 transition max-sm:hidden hover:text-slate-200"
          title="Store a key per provider and test that it actually reaches them"
        >
          ◇ keys
        </button>
        {keysOpen && <ProvidersPanel onClose={() => setKeysOpen(false)} />}
      </div>

      {/* brain — BYOK live-agent connection */}
      <div ref={brainRef} className="relative max-sm:absolute max-sm:top-1 max-sm:right-2">
        <button
          onClick={toggleBrain}
          className={`mono cursor-pointer rounded-md border px-2.5 py-1 text-[10px] whitespace-nowrap transition max-sm:hidden ${
            brainConnected
              ? "border-teal-300/50 bg-teal-400/10 text-teal-200 hover:bg-teal-400/25"
              : "border-white/10 bg-white/5 text-slate-500 hover:text-slate-300"
          }`}
          title={`Connect a live model to Critic — bring your own Anthropic key (model: ${activeModel})`}
        >
          ◈ brain: {brainConnected ? "live" : "mock"}
          {/* The model is only a fact while something is calling one. In mock
              the chip used to read "mock · opus-4-8", which names a model no
              request is going to — the same confusion the panel header had,
              one level down. Mock says what mock is instead. */}
          <span className={brainConnected ? "text-teal-300/60" : "text-slate-600"}>
            {" "}· {brainConnected ? shortModel(activeModel) : "no model"}
          </span>
        </button>
        <AnimatePresence>
          {brainOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="glass absolute top-9 right-0 z-40 w-72 rounded-xl p-3"
            >
              {/* The header REPORTS state; it does not name the feature. It
                  used to read "live brain · all agents" always — a fixed
                  label sitting under a chip that says `brain: mock`, so the
                  panel asserted the one thing the chip was denying. Same
                  vocabulary as the chip, same source of truth. */}
              <div className="mono flex items-center gap-1.5 text-[9px] tracking-[0.2em] text-slate-400 uppercase">
                <span
                  data-testid="brain-panel-state"
                  className={`rounded border px-1.5 py-px ${
                    brainConnected
                      ? "border-teal-300/40 bg-teal-400/10 text-teal-200"
                      : "border-white/15 bg-white/5 text-slate-400"
                  }`}
                >
                  brain: {brainConnected ? "live" : "mock"}
                </span>
                <span>· all agents</span>
              </div>
              {!brainConnected && (
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-amber-200/90">
                  No key in this browser — agents are answering from canned personas, not a model. Paste one below to
                  make every room live.
                </p>
              )}
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
                Your key is stored <span className="text-slate-200">only in this browser</span> and sent{" "}
                <span className="text-slate-200">only to api.anthropic.com</span>. Agents get the room transcript + live
                project context, and <span className="text-slate-200">four tools</span>: reading commits and repo files
                runs free, summoning an agent executes (reversible), and creating a project is{" "}
                <span className="text-amber-200">gated behind your approval</span>. Replies bill to your key.
              </p>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={brainConnected ? "key saved — paste to replace" : "sk-ant-…"}
                className="mono mt-2.5 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-teal-300/50"
              />
              <select
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                aria-label="Model"
                className="mono mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-[#0b1120] px-2 py-1.5 text-[11px] text-slate-300 outline-none"
              >
                {BRAIN_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {/* Without a key this select is a preference, not a fact — it
                  says which model WOULD be called. Saying so beats letting the
                  panel imply a model is in play. */}
              {!brainConnected && (
                <p className="mono mt-1 text-[9.5px] text-slate-500">
                  the model a key would be spent on — nothing calls it yet
                </p>
              )}
              <label className="mono mt-2 flex cursor-pointer items-start gap-2 text-[10px] leading-relaxed text-slate-400">
                <input
                  type="checkbox"
                  checked={routing}
                  onChange={(e) => {
                    setRoutingState(e.target.checked);
                    setRouting(e.target.checked);
                  }}
                  className="mt-0.5 cursor-pointer accent-teal-400"
                />
                <span>
                  route by role — judgment agents (Critic, Oracle) use the model above; the chattier ones drop to
                  sonnet or haiku. Never routes <em>up</em> past your choice.
                </span>
              </label>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => {
                    if (keyDraft.trim()) setKey(keyDraft);
                    setModel(modelDraft);
                    setActiveModel(modelDraft);
                    setBrainConnected(getKey() !== null);
                    setBrainOpen(false);
                    setKeyDraft("");
                  }}
                  className="mono flex-1 cursor-pointer rounded-lg border border-teal-300/40 bg-teal-400/15 px-2 py-1.5 text-[10.5px] text-teal-200 transition hover:bg-teal-400/30"
                >
                  save
                </button>
                <button
                  onClick={() => {
                    clearKey();
                    setBrainConnected(false);
                    setBrainOpen(false);
                    setKeyDraft("");
                  }}
                  className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-400 transition hover:text-rose-300"
                >
                  disconnect
                </button>
              </div>

              {/* danger zone: write access, off unless deliberately armed */}
              <div className="mt-3 border-t border-white/10 pt-2.5">
                <button
                  onClick={() => setDangerOpen((v) => !v)}
                  className="mono flex w-full cursor-pointer items-center justify-between text-[9px] tracking-[0.2em] text-rose-300/80 uppercase"
                >
                  <span>danger zone · commits {commitsArmed ? "· ARMED" : "· off"}</span>
                  <span className="text-slate-600">{dangerOpen ? "▾" : "▸"}</span>
                </button>
                {dangerOpen && (
                  <div className="mt-2">
                    <p className="text-[10.5px] leading-relaxed text-slate-400">
                      Arming lets agents <span className="text-slate-200">propose commits</span>. Every one is gated: you
                      see a diff and approve, and writes go to a{" "}
                      <span className="text-slate-200">new branch, never main</span>. Merging stays in GitHub.
                    </p>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-rose-300/80">
                      This stores a GitHub token with write scope in this browser. Use a fine-grained PAT limited to one
                      repo, contents-write only, short expiry — never a classic <code className="mono">repo</code> token.
                    </p>
                    <input
                      type="password"
                      value={ghDraft}
                      onChange={(e) => setGhDraft(e.target.value)}
                      placeholder={getGhToken() ? "token saved — paste to replace" : "github_pat_…"}
                      className="mono mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-rose-300/50"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          if (ghDraft.trim()) setGhToken(ghDraft);
                          setCommitsArmed(getGhToken() !== null);
                          setGhDraft("");
                        }}
                        className="mono flex-1 cursor-pointer rounded-lg border border-rose-300/40 bg-rose-400/15 px-2 py-1.5 text-[10.5px] text-rose-200 transition hover:bg-rose-400/30"
                      >
                        arm commit proposals
                      </button>
                      <button
                        onClick={() => {
                          clearGhToken();
                          setCommitsArmed(false);
                          setGhDraft("");
                        }}
                        className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-400 transition hover:text-slate-200"
                      >
                        disarm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* phone ⋯ menu — the whole right-hand cluster, one row each. The rows
          only flip the SAME open-states the chips do; the panels themselves
          stay mounted in the bar (parked wrappers above), so dismiss refs,
          Escape and outside-click keep working without a second copy of any
          panel. panel-solid, not bare glass: this sits over the canvas and
          backdrop-filter can't be trusted across the RF stacking contexts. */}
      <div ref={moreRef} className="relative sm:hidden">
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More controls"
          aria-expanded={moreOpen}
          className="mono grid h-10 w-10 cursor-pointer place-items-center rounded-md border border-white/10 bg-white/5 text-[16px] text-slate-300 transition hover:text-slate-100"
        >
          ⋯
        </button>
        {moreOpen && (
          <div className="glass panel-solid absolute top-11 right-0 z-40 w-60 rounded-xl p-1.5">
            <div className="mono px-2.5 pt-1.5 pb-1 text-[9px] tracking-[0.2em] text-slate-500 uppercase">
              <span className="text-teal-300">{active}</span> active
              {errored > 0 && <span className="text-rose-400"> · {errored} error</span>} · {agents.length} agents
            </div>
            <button
              onClick={() => {
                setMoreOpen(false);
                setSummonOpen(true);
              }}
              disabled={!project || summonable.length === 0}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-cyan-200 transition hover:bg-white/8 disabled:cursor-default disabled:text-slate-600"
            >
              + summon agent
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                setRosterOpen(true);
              }}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              ⚙ roster
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                setKeysOpen(true);
              }}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              ◇ keys
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                setJournalOpen(true);
              }}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              ▤ journal
            </button>
            <button
              onClick={() => setScale(SCALES[(SCALES.indexOf(uiScale) + 1) % SCALES.length])}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              ⌗ text {Math.round(uiScale * 100)}%
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                toggleBrain();
              }}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              ◈ brain: {brainConnected ? <span className="text-teal-200">live</span> : "mock"}
              <span className="text-slate-600">· {shortModel(activeModel)}</span>
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                // Search lives in the drawer on phone — open it, then focus
                // once the slide-in has landed (matches the drawer spring).
                onMenu?.();
                setTimeout(() => document.getElementById("hub-search")?.focus(), 350);
              }}
              className="mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-300 transition hover:bg-white/8"
            >
              search
            </button>
          </div>
        )}
      </div>

      {/* global search hint — focuses the sidebar search */}
      <button
        onClick={() => document.getElementById("hub-search")?.focus()}
        className="mono hidden cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-500 transition hover:text-slate-300 lg:block"
      >
        search <span className="text-slate-700">/</span>
      </button>

      {/* The manual. It owns its own button, open state and first-run showing,
          so this stays one element; its panel anchors to this bar rather than
          to the button, which is why its position in the strip is free. */}
      <Tutorial />
      <button
        aria-label="Collapse top bar"
        onClick={() => useChrome.getState().toggle("topBar")}
        className="mono -mr-1 grid h-6 w-6 flex-none cursor-pointer place-items-center rounded text-[10px] text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
      >
        ▴
      </button>
    </div>
  );
}
