import { useEffect, useRef, useState } from "react";
import { probeProvider, type ProbeResult, type ProbeStatus } from "../agents/providers";
import {
  VENDORS,
  getVendorKey,
  setVendorKey,
  clearVendorKey,
  getVendorUrl,
  setVendorUrl,
  type Vendor,
} from "../agents/vendors";

// Credentials for every VENDOR, in one place, with an honest reachability
// readout.
//
// This panel used to list the three TRANSPORTS — anthropic, google,
// openai-compatible — which is the right abstraction for the wire and the wrong
// one for a human: it reads as "where are all the other companies?", and worse,
// every OpenAI-shaped vendor shared ONE key slot, so xAI and Groq could not both
// be configured. Rows are companies now, and each company owns its own key.
//
// The panel stores nothing it does not have to: the key input is never prefilled
// from storage, so a saved key is reported as "saved" and never rendered. The
// probe is the point of the panel — five different outcomes are five different
// colours, because "blocked by the browser" and "your key is wrong" get confused
// constantly and only one of them is the operator's fault.

// The word an operator can act on, and the colour that matches it.
const VERDICT: Record<ProbeStatus, { word: string; cls: string; dot: string }> = {
  ok: { word: "reachable", cls: "text-teal-200 border-teal-300/40 bg-teal-400/10", dot: "#5eead4" },
  "bad-key": { word: "key rejected", cls: "text-rose-200 border-rose-300/40 bg-rose-400/10", dot: "#fda4af" },
  "cors-blocked": { word: "blocked by the browser", cls: "text-amber-200 border-amber-300/40 bg-amber-400/10", dot: "#fcd34d" },
  "server-error": { word: "server error", cls: "text-amber-200 border-amber-300/40 bg-amber-400/10", dot: "#fcd34d" },
  "network-error": { word: "no route", cls: "text-slate-300 border-white/15 bg-white/5", dot: "#94a3b8" },
};

// Our own plain-words gloss, shown under the verdict. probeProvider's own detail
// follows it — that one carries the HTTP status and the host.
const GLOSS: Record<ProbeStatus, string> = {
  ok: "the endpoint answered and accepted this key.",
  "bad-key": "the endpoint answered and refused this key — check for a stray space or the wrong provider.",
  "cors-blocked": "not a key problem; the host is up but sends no CORS headers, so a web page cannot call it. Needs the desktop app or a proxy.",
  "server-error": "reachable, but the check itself failed — the key was neither confirmed nor rejected.",
  "network-error": "nothing reached the host: offline, DNS, a bad base URL, or a refused connection.",
};

// Shape of the key each vendor issues, so a paste into the wrong row is obvious
// before a probe is ever spent on it.
const KEY_HINT: Record<string, string> = {
  anthropic: "sk-ant-…",
  google: "AIza…",
  openrouter: "sk-or-…",
  xai: "xai-…",
  groq: "gsk_…",
  deepseek: "sk-…",
  mistral: "…",
  together: "…",
  openai: "sk-…",
  local: "anything — most local servers ignore it",
};

export default function ProvidersPanel({ onClose }: { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(VENDORS.map((v) => [v.id, getVendorUrl(v.id) ?? ""]))
  );
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // A probe in flight when the panel closes must not write into a dead tree.
  // Re-armed in the effect BODY, not just at init: StrictMode mounts, unmounts,
  // and remounts, so an init-only `true` is left permanently false by the first
  // cleanup and every probe result is silently dropped.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Committed on blur and again just before a probe, so "test" always measures
  // what was actually typed. The field is emptied once the value is stored: the
  // placeholder then reads "key saved", and the secret stops living in a DOM
  // node anyone can serialise.
  const commitKey = (id: string) => {
    const draft = (drafts[id] ?? "").trim();
    if (!draft) return;
    setVendorKey(id, draft);
    setDrafts((d) => ({ ...d, [id]: "" }));
  };

  const runProbe = async (v: Vendor) => {
    commitKey(v.id);
    const apiKey = getVendorKey(v.id) ?? "";
    const baseUrl = getVendorUrl(v.id) ?? undefined;
    setBusy((b) => ({ ...b, [v.id]: true }));
    let result: ProbeResult;
    try {
      result = await probeProvider({ provider: v.provider, apiKey, baseUrl, label: v.label });
    } catch (e) {
      result = { status: "network-error", detail: e instanceof Error ? e.message : "the probe itself threw" };
    }
    if (!live.current) return;
    setProbes((r) => ({ ...r, [v.id]: result }));
    setBusy((b) => ({ ...b, [v.id]: false }));
  };

  return (
    <div data-testid="providers-panel" className="glass panel-solid absolute top-9 right-0 z-40 w-[25rem] rounded-xl p-3">
      <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">vendors &amp; keys</div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
        Keys live <span className="text-slate-200">only in this browser</span> and go straight to the vendor — nothing
        of ours is in the path. Every vendor keeps its own key, so several can be configured at once.
      </p>

      {/* Ten rows will not fit above the fold, so the list scrolls and the
          header and the done button stay put. */}
      <div data-testid="vendor-list" className="mt-3 max-h-[54vh] space-y-2.5 overflow-y-auto pr-1">
        {VENDORS.map((v) => {
          const saved = getVendorKey(v.id) !== null;
          const probe = probes[v.id];
          const probing = !!busy[v.id];
          const verdict = probe ? VERDICT[probe.status] : null;
          const needsUrl = v.provider === "openai-compatible";

          return (
            <div key={v.id} data-testid={`vendor-row-${v.id}`} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-slate-200">{v.label}</span>
                {saved && (
                  <span
                    data-testid={`saved-${v.id}`}
                    className="mono rounded bg-teal-400/10 px-1 py-px text-[8.5px] tracking-wider text-teal-300 uppercase"
                    title="a key for this vendor is stored in this browser"
                  >
                    ✓ key
                  </span>
                )}
                <div className="flex-1" />
                <a
                  href={v.docs}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono text-[9px] text-slate-500 transition hover:text-slate-300"
                >
                  get a key ↗
                </a>
              </div>

              {/* Said BEFORE a key is pasted, not after a probe: no key can fix
                  a missing CORS header, so the operator should never spend one
                  finding that out. */}
              {v.browserBlocked && v.note && (
                <div
                  data-testid={`blocked-${v.id}`}
                  className="mt-1.5 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200"
                >
                  {v.note}
                </div>
              )}

              <input
                type="password"
                autoComplete="off"
                data-testid={`key-${v.id}`}
                value={drafts[v.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                onBlur={() => commitKey(v.id)}
                placeholder={saved ? "key saved — paste to replace" : (KEY_HINT[v.id] ?? "api key")}
                className="mono mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-teal-300/50"
              />

              {/* Only the OpenAI-shaped vendors have an endpoint to point at.
                  Presets are prefilled and overridable — that is what makes
                  local/custom work without a second UI. */}
              {needsUrl && (
                <input
                  data-testid={`baseurl-${v.id}`}
                  value={urls[v.id] ?? ""}
                  onChange={(e) => {
                    setUrls((u) => ({ ...u, [v.id]: e.target.value }));
                    setVendorUrl(v.id, e.target.value);
                  }}
                  placeholder={v.baseUrl ?? "https://…/v1"}
                  title="base URL — the preset is a suggestion, not a whitelist"
                  className="mono mt-1.5 w-full rounded-lg border border-white/10 bg-[#0b1120] px-2.5 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-cyan-300/50"
                />
              )}

              {v.note && !v.browserBlocked && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{v.note}</p>
              )}

              <div className="mt-1.5 flex gap-2">
                <button
                  data-testid={`test-${v.id}`}
                  onClick={() => void runProbe(v)}
                  disabled={probing}
                  title="Send one cheap authenticated GET and report exactly what came back"
                  className="mono flex-1 cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-2 py-1.5 text-[10.5px] text-cyan-200 transition hover:bg-cyan-400/25 disabled:cursor-default disabled:border-white/10 disabled:bg-transparent disabled:text-slate-600"
                >
                  {probing ? <span className="inline-block animate-spin">◌</span> : "test"}
                  {probing && <span className="ml-1.5">testing…</span>}
                </button>
                <button
                  data-testid={`forget-${v.id}`}
                  onClick={() => {
                    clearVendorKey(v.id);
                    setDrafts((d) => ({ ...d, [v.id]: "" }));
                    setProbes((r) => {
                      const next = { ...r };
                      delete next[v.id];
                      return next;
                    });
                  }}
                  title="Remove this key from this browser"
                  className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-400 transition hover:text-rose-300"
                >
                  forget
                </button>
              </div>

              {probe && (
                <div data-testid={`probe-${v.id}`} className={`mono mt-1.5 rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed ${verdict!.cls}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: verdict!.dot, boxShadow: `0 0 6px ${verdict!.dot}` }} />
                    <span className="tracking-wider uppercase">{verdict!.word}</span>
                    {probe.httpStatus !== undefined && <span className="opacity-60">http {probe.httpStatus}</span>}
                  </span>
                  <span className="mt-1 block font-sans text-[10.5px] text-slate-400">{GLOSS[probe.status]}</span>
                  <span className="mt-0.5 block font-sans text-[10px] text-slate-500">{probe.detail}</span>
                </div>
              )}
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
