import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub, agentInScope } from "../state/hub";
import { getKey, setKey, clearKey, getModel, setModel, BRAIN_MODELS, getGhToken, setGhToken, clearGhToken, getRouting, setRouting } from "../agents/brain";
import RosterPanel from "./RosterPanel";
import ProvidersPanel from "./ProvidersPanel";
import Tutorial from "./Tutorial";

// "claude-haiku-4-5" → "haiku-4-5"; anything long gets clipped so the bar never blows out.
const shortModel = (id: string) => {
  const s = id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
};

// The thin command strip over the stage: where you are, who's active, summon.
export default function MissionControl() {
  const stage = useHub((s) => s.stage);
  const projects = useHub((s) => s.projects);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const projectMode = useHub((s) => s.projectMode);
  const setProjectMode = useHub((s) => s.setProjectMode);
  const backToGraph = useHub((s) => s.backToGraph);
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
  const [routing, setRoutingState] = useState(getRouting());
  const [activeModel, setActiveModel] = useState(getModel());
  const commitsArmed = useHub((s) => s.commitsArmed);
  const setCommitsArmed = useHub((s) => s.setCommitsArmed);
  const summonRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);

  const anyOpen = summonOpen || brainOpen || keysOpen;

  // One handler for both popovers: click outside dismisses, Escape dismisses the whole stack.
  useEffect(() => {
    if (!anyOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (summonRef.current && !summonRef.current.contains(t)) setSummonOpen(false);
      if (brainRef.current && !brainRef.current.contains(t)) setBrainOpen(false);
      if (keysRef.current && !keysRef.current.contains(t)) setKeysOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSummonOpen(false);
      setBrainOpen(false);
      setDangerOpen(false);
      setKeysOpen(false);
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
  }, [stage]);

  const project = stage.kind === "project" ? projects.find((p) => p.id === stage.id) : undefined;
  const active = agents.filter((a) => a.status.kind === "working" || a.status.kind === "talking").length;
  const errored = agents.filter((a) => a.status.kind === "error").length;
  const summonable = project
    ? agents.filter((a) => agentInScope(a, project.id) && assignments[a.id] !== project.id)
    : [];

  return (
    <div className="relative z-30 flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/8 bg-[#070b17]/90 px-4 py-1 backdrop-blur">
      {/* location */}
      <button onClick={backToGraph} className={`mono cursor-pointer text-[11px] transition ${project ? "text-slate-500 hover:text-slate-300" : "text-slate-200"}`}>
        constellation
      </button>
      {project && (
        <>
          <span className="mono text-[11px] text-slate-700">/</span>
          <span className="mono flex items-center gap-1.5 text-[11px] text-slate-100">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.hue, boxShadow: `0 0 6px ${project.hue}` }} />
            {project.name}
          </span>
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

      {/* summon */}
      <div ref={summonRef} className="relative">
        <button
          onClick={() => setSummonOpen((v) => !v)}
          disabled={!project || summonable.length === 0}
          className="mono cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-400/25 disabled:cursor-default disabled:border-white/10 disabled:text-slate-600 disabled:hover:bg-transparent"
          title={project ? "Summon an agent onto this project" : "Select a project first"}
        >
          + summon agent
        </button>
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
      </div>

      {/* per-agent brains */}
      <div className="relative">
        <button
          onClick={() => setRosterOpen((v) => !v)}
          className="mono cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400 transition hover:text-slate-200"
          title="Choose the provider and model for each agent"
        >
          ⚙ roster
        </button>
        {rosterOpen && <RosterPanel onClose={() => setRosterOpen(false)} />}
      </div>

      {/* provider credentials — one key per provider, plus an honest reachability probe */}
      <div ref={keysRef} className="relative">
        <button
          data-testid="keys-button"
          onClick={() => setKeysOpen((v) => !v)}
          className="mono cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400 transition hover:text-slate-200"
          title="Store a key per provider and test that it actually reaches them"
        >
          ◇ keys
        </button>
        {keysOpen && <ProvidersPanel onClose={() => setKeysOpen(false)} />}
      </div>

      {/* brain — BYOK live-agent connection */}
      <div ref={brainRef} className="relative">
        <button
          onClick={() => {
            setBrainOpen((v) => !v);
            setKeyDraft("");
            setModelDraft(getModel());
            setActiveModel(getModel());
          }}
          className={`mono cursor-pointer rounded-md border px-2.5 py-1 text-[10px] whitespace-nowrap transition ${
            brainConnected
              ? "border-teal-300/50 bg-teal-400/10 text-teal-200 hover:bg-teal-400/25"
              : "border-white/10 bg-white/5 text-slate-500 hover:text-slate-300"
          }`}
          title={`Connect a live model to Critic — bring your own Anthropic key (model: ${activeModel})`}
        >
          ◈ brain: {brainConnected ? "live" : "mock"}
          <span className={brainConnected ? "text-teal-300/60" : "text-slate-600"}> · {shortModel(activeModel)}</span>
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
              <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">live brain · all agents</div>
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
                className="mono mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-[#0b1120] px-2 py-1.5 text-[11px] text-slate-300 outline-none"
              >
                {BRAIN_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
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
    </div>
  );
}
