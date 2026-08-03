import { useState } from "react";
import { useHub } from "../state/hub";
import { modelForAgent, BRAIN_MODELS } from "../agents/brain";
import { brainFor, clearAllOverrides, clearOverride, getOverride, setOverride, type ProviderId } from "../agents/roster";

// Who thinks with what, one row per agent. The preset (role-tier routing on the
// chosen model) shows as dim placeholder text; an explicit override replaces it
// and can be cleared back with the ↺. Nothing here dispatches a request — it
// only records intent, which the stream paths read at call time.

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  google: "Google",
  "openai-compatible": "OpenAI-compatible",
};

const MODELS_BY_PROVIDER: Record<ProviderId, string[]> = {
  anthropic: [...BRAIN_MODELS],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  "openai-compatible": ["grok-4", "llama-3.3-70b-versatile", "openai/gpt-5"],
};

export default function RosterPanel({ onClose }: { onClose: () => void }) {
  const agents = useHub((s) => s.agents);
  const [, force] = useState(0);
  const redraw = () => force((n) => n + 1);

  return (
    <div className="glass absolute top-9 right-0 z-40 w-[22rem] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">who thinks with what</div>
        <button
          onClick={() => {
            clearAllOverrides();
            redraw();
          }}
          className="mono cursor-pointer text-[9px] text-slate-500 hover:text-slate-300"
          title="Put every agent back on the role-tier preset"
        >
          reset all
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
        Blank means the preset: judgment roles on your chosen model, chatty ones cheaper. Set one explicitly and it
        wins — including a deliberate upgrade.
      </p>

      <div className="mt-2.5 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {agents.map((a) => {
          const override = getOverride(a.id);
          const preset = { provider: "anthropic" as ProviderId, model: modelForAgent(a.id) };
          const effective = brainFor(a.id, preset);
          return (
            <div key={a.id} className="flex items-center gap-1.5">
              <span
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8px] font-bold text-white"
                style={{ background: a.color }}
                title={a.role}
              >
                {a.glyph}
              </span>
              <span className="mono w-12 flex-none truncate text-[10px] text-slate-300">{a.name}</span>

              <select
                value={effective.provider}
                onChange={(e) => {
                  const provider = e.target.value as ProviderId;
                  setOverride(a.id, { provider, model: MODELS_BY_PROVIDER[provider][0] });
                  redraw();
                }}
                className="mono min-w-0 flex-1 cursor-pointer rounded border border-white/10 bg-[#0b1120] px-1 py-0.5 text-[9.5px] text-slate-300 outline-none"
              >
                {(Object.keys(PROVIDER_LABEL) as ProviderId[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>

              <input
                list={`models-${a.id}`}
                value={effective.model}
                onChange={(e) => {
                  setOverride(a.id, { provider: effective.provider, model: e.target.value });
                  redraw();
                }}
                placeholder={preset.model}
                className={`mono min-w-0 flex-[1.4] rounded border bg-[#0b1120] px-1 py-0.5 text-[9.5px] outline-none ${
                  override ? "border-teal-300/40 text-teal-200" : "border-white/10 text-slate-400"
                }`}
              />
              <datalist id={`models-${a.id}`}>
                {MODELS_BY_PROVIDER[effective.provider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <button
                onClick={() => {
                  clearOverride(a.id);
                  redraw();
                }}
                disabled={!override}
                title={override ? "Back to the preset" : "Already on the preset"}
                className="mono w-4 flex-none cursor-pointer text-[10px] text-slate-600 transition hover:text-slate-300 disabled:cursor-default disabled:opacity-30"
              >
                ↺
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        className="mono mt-2.5 w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-300 transition hover:bg-white/10"
      >
        done
      </button>
    </div>
  );
}
