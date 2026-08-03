import { useState } from "react";
import { useHub } from "../state/hub";
import { modelForAgent } from "../agents/brain";
import { brainFor, clearAllOverrides, clearOverride, getOverride, setOverride } from "../agents/roster";
import { VENDORS, getVendorKey, vendorById } from "../agents/vendors";

// Who thinks with what, one row per agent.
//
// The choice here is a VENDOR (a company), not a transport — "OpenAI-compatible"
// is a wire format and told the operator nothing. Models are a real dropdown of
// that vendor's known ids plus a custom… escape hatch, because a combobox that
// only suggested the current vendor's models read as "the field is stuck".

const CUSTOM = "__custom__";

export default function RosterPanel({ onClose }: { onClose: () => void }) {
  const agents = useHub((s) => s.agents);
  const [, force] = useState(0);
  const redraw = () => force((n) => n + 1);
  const [customFor, setCustomFor] = useState<string | null>(null);

  return (
    <div className="glass panel-solid absolute top-9 right-0 z-40 w-[25rem] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">who thinks with what</div>
        <button
          onClick={() => {
            clearAllOverrides();
            setCustomFor(null);
            redraw();
          }}
          className="mono cursor-pointer text-[9px] text-slate-500 hover:text-slate-300"
          title="Put every agent back on the role-tier preset"
        >
          reset all
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
        Blank means the preset: judgment roles on your chosen model, chatty ones cheaper. Each vendor keeps its own key
        — set them in <span className="text-slate-300">◇ keys</span>.
      </p>

      <div className="mt-2.5 max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {agents.map((a) => {
          const override = getOverride(a.id);
          const preset = { vendor: "anthropic", model: modelForAgent(a.id) };
          const effective = brainFor(a.id, preset);
          const vendorId = effective.vendor ?? "anthropic";
          const vendor = vendorById(vendorId);
          const known = vendor?.models ?? [];
          const isCustom = customFor === a.id || (effective.model !== "" && !known.includes(effective.model));
          const hasKey = getVendorKey(vendorId) !== null;

          return (
            <div key={a.id} className="flex items-center gap-1.5">
              <span
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8px] font-bold text-white"
                style={{ background: a.color }}
                title={a.role}
              >
                {a.glyph}
              </span>
              <span className="mono w-11 flex-none truncate text-[10px] text-slate-300">{a.name}</span>

              {/* vendor */}
              <select
                value={vendorId}
                onChange={(e) => {
                  const v = vendorById(e.target.value);
                  setOverride(a.id, { vendor: e.target.value, model: v?.models[0] ?? "" });
                  setCustomFor(null);
                  redraw();
                }}
                title={vendor?.note ?? vendor?.label}
                className={`mono min-w-0 flex-[1.1] cursor-pointer rounded border bg-[#0b1120] px-1 py-0.5 text-[9.5px] outline-none ${
                  vendor?.browserBlocked
                    ? "border-amber-300/40 text-amber-200"
                    : hasKey
                      ? "border-white/10 text-slate-300"
                      : "border-white/10 text-slate-500"
                }`}
              >
                {VENDORS.map((v) => (
                  <option key={v.id} value={v.id} title={v.label}>
                    {/* the parenthetical belongs in ◇ keys; this control is too narrow for it */}
                    {v.short ?? v.label}
                    {getVendorKey(v.id) ? " ✓" : ""}
                  </option>
                ))}
              </select>

              {/* model: a real dropdown, with an escape hatch for drift */}
              {isCustom ? (
                <input
                  autoFocus
                  value={effective.model}
                  onChange={(e) => {
                    setOverride(a.id, { vendor: vendorId, model: e.target.value });
                    redraw();
                  }}
                  onBlur={() => setCustomFor(null)}
                  placeholder="model id"
                  className="mono min-w-0 flex-[1.3] rounded border border-teal-300/40 bg-[#0b1120] px-1 py-0.5 text-[9.5px] text-teal-200 outline-none"
                />
              ) : (
                <select
                  value={effective.model}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM) {
                      setCustomFor(a.id);
                      return;
                    }
                    setOverride(a.id, { vendor: vendorId, model: e.target.value });
                    redraw();
                  }}
                  className={`mono min-w-0 flex-[1.3] cursor-pointer rounded border bg-[#0b1120] px-1 py-0.5 text-[9.5px] outline-none ${
                    override ? "border-teal-300/40 text-teal-200" : "border-white/10 text-slate-400"
                  }`}
                >
                  {!known.includes(effective.model) && <option value={effective.model}>{effective.model}</option>}
                  {known.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={CUSTOM}>custom…</option>
                </select>
              )}

              <button
                onClick={() => {
                  clearOverride(a.id);
                  setCustomFor(null);
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

      <p className="mono mt-2 text-[9px] leading-relaxed text-slate-600">
        ✓ marks a vendor you already have a key for. Model ids drift — custom… takes any string.
      </p>

      <button
        onClick={onClose}
        className="mono mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-300 transition hover:bg-white/10"
      >
        done
      </button>
    </div>
  );
}
