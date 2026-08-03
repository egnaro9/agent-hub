import { useEffect, useRef, useState } from "react";
import {
  PROVIDERS,
  PROVIDER_IDS,
  getProviderKey,
  setProviderKey,
  clearProviderKey,
  getBaseUrl,
  setBaseUrl,
  readyToCall,
  probeProvider,
  type Provider,
  type ProbeResult,
  type ProbeStatus,
} from "../agents/providers";

// Credentials for every provider, in one place, with an honest reachability
// readout. The panel stores nothing it does not have to: the key input is never
// prefilled from storage, so a saved key is reported as "saved" and never
// rendered. The probe is the point of the panel — four different failures are
// four different colours, because "blocked by the browser" and "your key is
// wrong" get confused constantly and only one of them is the operator's fault.

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

const PRESET_LABEL = (u: string): string => {
  if (u.includes("openrouter.ai")) return "OpenRouter";
  if (u.includes("groq.com")) return "Groq";
  if (u.includes("x.ai")) return "xAI";
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

const KEY_HINT: Record<Provider, string> = {
  anthropic: "sk-ant-…",
  google: "AIza…",
  "openai-compatible": "sk-or-… / gsk_… / xai-…",
};

export default function ProvidersPanel({ onClose }: { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDER_IDS.map((p) => [p, getBaseUrl(p) ?? ""]))
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
  const commitKey = (p: Provider) => {
    const draft = (drafts[p] ?? "").trim();
    if (!draft) return;
    setProviderKey(p, draft);
    setDrafts((d) => ({ ...d, [p]: "" }));
  };

  const runProbe = async (p: Provider) => {
    commitKey(p);
    const apiKey = getProviderKey(p) ?? "";
    const baseUrl = PROVIDERS[p].needsBaseUrl ? (getBaseUrl(p) ?? urls[p] ?? "") : undefined;
    setBusy((b) => ({ ...b, [p]: true }));
    let result: ProbeResult;
    try {
      result = await probeProvider({ provider: p, apiKey, baseUrl });
    } catch (e) {
      result = { status: "network-error", detail: e instanceof Error ? e.message : "the probe itself threw" };
    }
    if (!live.current) return;
    setProbes((r) => ({ ...r, [p]: result }));
    setBusy((b) => ({ ...b, [p]: false }));
  };

  return (
    <div data-testid="providers-panel" className="glass absolute top-9 right-0 z-40 max-h-[70vh] w-[24rem] overflow-y-auto rounded-xl p-3">
      <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">providers &amp; keys</div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
        Keys live <span className="text-slate-200">only in this browser</span> and go straight to the provider — nothing
        of ours is in the path. <span className="text-amber-200">api.openai.com cannot be called from a web page at
        all</span> (it sends no CORS headers), so reach GPT models through OpenRouter.
      </p>

      <div className="mt-3 space-y-2.5">
        {PROVIDER_IDS.map((p) => {
          const info = PROVIDERS[p];
          const saved = getProviderKey(p) !== null;
          const ready = readyToCall(p);
          const probe = probes[p];
          const probing = !!busy[p];
          const verdict = probe ? VERDICT[probe.status] : null;

          return (
            <div key={p} data-testid={`provider-row-${p}`} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-slate-200">{info.label}</span>
                <span
                  className={`mono rounded px-1 py-px text-[8.5px] tracking-wider uppercase ${
                    ready.ok ? "bg-teal-400/10 text-teal-300" : "bg-white/5 text-slate-500"
                  }`}
                  title={ready.ok ? "key stored — ready to call" : ready.reason}
                >
                  {ready.ok ? "ready" : saved ? "needs url" : "no key"}
                </span>
                <div className="flex-1" />
                <a
                  href={info.docs}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono text-[9px] text-slate-500 transition hover:text-slate-300"
                >
                  get a key ↗
                </a>
              </div>

              <input
                type="password"
                autoComplete="off"
                data-testid={`key-${p}`}
                value={drafts[p] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p]: e.target.value }))}
                onBlur={() => commitKey(p)}
                placeholder={saved ? "key saved — paste to replace" : KEY_HINT[p]}
                className="mono mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-teal-300/50"
              />

              {info.needsBaseUrl && (
                <>
                  <input
                    list={`baseurl-presets-${p}`}
                    data-testid={`baseurl-${p}`}
                    value={urls[p] ?? ""}
                    onChange={(e) => {
                      setUrls((u) => ({ ...u, [p]: e.target.value }));
                      setBaseUrl(p, e.target.value);
                    }}
                    placeholder="https://openrouter.ai/api/v1"
                    className="mono mt-1.5 w-full rounded-lg border border-white/10 bg-[#0b1120] px-2.5 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-cyan-300/50"
                  />
                  <datalist id={`baseurl-presets-${p}`}>
                    {info.baseUrlPresets.map((u) => (
                      <option key={u} value={u} label={PRESET_LABEL(u)} />
                    ))}
                  </datalist>
                </>
              )}

              <div className="mt-1.5 flex gap-2">
                <button
                  data-testid={`test-${p}`}
                  onClick={() => void runProbe(p)}
                  disabled={probing}
                  title="Send one cheap authenticated GET and report exactly what came back"
                  className="mono flex-1 cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-2 py-1.5 text-[10.5px] text-cyan-200 transition hover:bg-cyan-400/25 disabled:cursor-default disabled:border-white/10 disabled:bg-transparent disabled:text-slate-600"
                >
                  {probing ? <span className="inline-block animate-spin">◌</span> : "test"}
                  {probing && <span className="ml-1.5">testing…</span>}
                </button>
                <button
                  data-testid={`forget-${p}`}
                  onClick={() => {
                    clearProviderKey(p);
                    setDrafts((d) => ({ ...d, [p]: "" }));
                    setProbes((r) => {
                      const next = { ...r };
                      delete next[p];
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
                <div data-testid={`probe-${p}`} className={`mono mt-1.5 rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed ${verdict!.cls}`}>
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
