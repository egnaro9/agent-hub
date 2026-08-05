import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../state/hub";
import { getKey } from "../agents/brain";
import { VENDORS } from "../agents/vendors";

// Everything this app has written into this browser, in one place, with a way
// to delete it.
//
// The real gap was never "more preferences". It is that two live credentials —
// a vendor API key and a GitHub token with WRITE scope — plus every room
// transcript sit in localStorage with no screen that admits they exist. ◇ keys
// shows a ✓ per vendor and nothing else; the GitHub token is buried two
// disclosures deep in the brain menu; agent-hub:state is invisible entirely.
// An operator who wanted to leave this machine clean had to open devtools.
//
// One rule holds this whole file together: a stored secret's VALUE never
// reaches the DOM. Not in a title, not in a disabled input, not "just the
// prefix". A tutorial that leaks the token it is explaining is worse than no
// tutorial, so secret rows render presence and at most the last four
// characters — enough to tell two pasted keys apart, useless to anyone reading
// over a shoulder or scraping the page.

// "unknown" is its own tier on purpose. Hiding an unrecognised slot's value is
// the only safe default — we cannot promise it is not a credential. Counting it
// AS a credential is a different claim, and a false one: the first unrecognised
// slot this screen met in the wild was a "have you seen the tutorial" flag, and
// calling that a credential is exactly the cry-wolf that makes an operator stop
// reading the amber rows that matter.
type Sensitivity = "none" | "secret" | "write" | "unknown";

type Group = "credentials" | "settings" | "state" | "unknown";

interface Slot {
  key: string;
  /** Plain English, not the storage key. */
  name: string;
  /** What is actually in there. */
  holds: string;
  sensitivity: Sensitivity;
  group: Group;
  /** A summary of a NON-secret value. Never returns the raw blob. */
  describe?: (raw: string) => string;
  /** Shown under the row when the slot has a trap worth naming. */
  note?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// agent-hub:state is the only slot big enough that its raw value is both
// useless to read and unsafe to render — room transcripts can contain anything
// an operator typed. Count it, weigh it, never print it.
const describeState = (raw: string): string => {
  const kb = `${Math.max(1, Math.round(raw.length / 1024))} KB`;
  try {
    const s = (JSON.parse(raw)?.state ?? {}) as {
      channels?: Record<string, { messages?: unknown[] }>;
      extraProjects?: unknown[];
    };
    const channels = Object.values(s.channels ?? {});
    const msgs = channels.reduce((n, c) => n + (c?.messages?.length ?? 0), 0);
    const made = (s.extraProjects ?? []).length;
    return [
      plural(channels.length, "room"),
      plural(msgs, "message"),
      ...(made ? [`${plural(made, "project")} you created`] : []),
      kb,
    ].join(" · ");
  } catch {
    // A half-written or hand-edited blob still deserves an honest row.
    return kb;
  }
};

const countKeys = (raw: string, one: string, many?: string): string => {
  try {
    const v = JSON.parse(raw);
    const n = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0;
    return plural(n, one, many);
  } catch {
    return "unreadable — safe to forget";
  }
};

// Short, non-secret values are shown verbatim: a model id or a base URL is
// exactly what an operator came here to check.
const literal = (raw: string) => (raw.length > 52 ? `${raw.slice(0, 51)}…` : raw);

const vendorLabel = (id: string) => VENDORS.find((v) => v.id === id)?.label ?? id;

// The catalog. Every slot any version of this app has ever written, including
// the ones nothing writes anymore — a credential no screen can see is the worst
// kind, so the dead pre-vendor slots are listed loudest, not quietly omitted.
const CATALOG: Slot[] = [
  {
    key: "agent-hub:gh-token",
    name: "GitHub write token",
    holds: "a personal access token with write scope. Its presence alone is what arms the commit tool.",
    sensitivity: "write",
    group: "credentials",
    note: "The only credential here that can CHANGE A REPO. An API key can spend your money; this can rewrite your code. If you are stepping away from this machine, forget this one first.",
  },
  {
    key: "agent-hub:anthropic-key",
    name: "Anthropic key (original slot)",
    holds: "your Anthropic API key. This is also the flag the app reads at startup to decide whether the brain is live.",
    sensitivity: "secret",
    group: "credentials",
    note: "Written twice: the brain menu writes here, and saving an Anthropic key in ◇ keys mirrors into here as well as the vendor slot below. Forgetting one row leaves the other — clear both to be sure.",
  },
  ...VENDORS.map(
    (v): Slot => ({
      key: `agent-hub:vkey:${v.id}`,
      name: `${v.label} key`,
      holds: `your ${v.label} API key, used for any agent routed to this vendor.`,
      sensitivity: "secret",
      group: "credentials",
      ...(v.id === "anthropic"
        ? { note: "Mirrored from the row above — the app reads this one first and falls back to the original slot." }
        : {}),
    })
  ),
  ...(["anthropic", "google", "openai-compatible"] as const).map(
    (p): Slot => ({
      key: `agent-hub:key:${p}`,
      name: `${p} key (retired)`,
      holds: "an API key from the design that stored one key per wire format, before vendors each got their own.",
      sensitivity: "secret",
      group: "credentials",
      note: "Nothing writes this anymore and, until this screen existed, nothing could delete it either. If it is set, it is a leftover credential — forget it.",
    })
  ),
  {
    key: "agent-hub:state",
    name: "App state",
    holds: "every room's participants and message history, resolved approval cards, who is assigned where, projects you created, and where you dragged each node.",
    sensitivity: "none",
    group: "state",
    describe: describeState,
    note: "Not a secret slot, but not secret-free either: it holds whatever you and the models typed into the rooms.",
  },
  {
    key: "agent-hub:journal",
    name: "Operator journal",
    holds: "the append-only ledger: gate proposals and outcomes, commit branches and URLs, shape runs with quoted-vs-actual spend, danger-zone armings. Capped at 500 rows.",
    sensitivity: "none",
    group: "state",
    describe: (raw) => {
      try {
        const rows: unknown = JSON.parse(raw);
        return Array.isArray(rows) ? `${rows.length} row${rows.length === 1 ? "" : "s"}` : "unreadable";
      } catch {
        return "unreadable";
      }
    },
    note: "Deliberately outside the app-state blob, so the chat's 80-message cap can never erase an approval's record. ▤ journal in the strip browses and exports it; clearing it here or there is the same delete.",
  },
  {
    key: "agent-hub:starred",
    name: "Pinned projects",
    holds: "which projects you starred in the sidebar.",
    sensitivity: "none",
    group: "state",
    describe: (raw) => countKeys(raw, "pinned"),
  },
  {
    key: "agent-hub:agent-brains",
    name: "Per-agent model overrides",
    holds: "the vendor and model you picked for individual agents in ⚙ roster.",
    sensitivity: "none",
    group: "settings",
    describe: (raw) => countKeys(raw, "agent overridden", "agents overridden"),
  },
  {
    key: "agent-hub:brain-model",
    name: "Chosen model",
    holds: "the Anthropic model the brain menu is set to.",
    sensitivity: "none",
    group: "settings",
    describe: literal,
  },
  {
    key: "agent-hub:route-by-role",
    name: "Route by role",
    holds: "whether judgment agents get the strong model and chatty ones drop cheaper.",
    sensitivity: "none",
    group: "settings",
    describe: (raw) => (raw === "off" ? "off" : "on"),
  },
  {
    key: "agent-hub:gen-config",
    name: "Generation config pin",
    holds: "a max_tokens (and optionally temperature) override for every live model call — the run export records whichever values were in force.",
    sensitivity: "none",
    group: "settings",
    describe: literal,
    note: "No UI writes this — it is set from the console or a script when a study needs pinned conditions. Absent means the defaults (max_tokens 1024, provider-default temperature).",
  },
  {
    key: "agent-hub:custom-shapes",
    name: "Custom topology shapes",
    holds: "run shapes you composed yourself, as stages.",
    sensitivity: "none",
    group: "settings",
    describe: (raw) => countKeys(raw, "shape"),
  },
  ...VENDORS.map(
    (v): Slot => ({
      key: `agent-hub:vurl:${v.id}`,
      name: `${v.label} endpoint`,
      holds: "a base URL overriding this vendor's preset — this is how a local model gets pointed at.",
      sensitivity: "none",
      group: "settings",
      describe: literal,
      note: "Survives forgetting the key: ◇ keys clears the credential, not the address.",
    })
  ),
  {
    key: "agent-hub:base-url:openai-compatible",
    name: "Shared endpoint (retired)",
    holds: "one base URL shared by every OpenAI-shaped vendor, from before each got its own.",
    sensitivity: "none",
    group: "settings",
    describe: literal,
  },
  {
    key: "agent-hub:provider",
    name: "Chosen wire format (retired)",
    holds: "the single selected transport from the pre-vendor design.",
    sensitivity: "none",
    group: "settings",
    describe: literal,
    note: "Dead — nothing reads it to route anything now.",
  },
  ...(["anthropic", "google", "openai-compatible"] as const).map(
    (p): Slot => ({
      key: `agent-hub:model:${p}`,
      name: `${p} model (retired)`,
      holds: "a model id per transport, from the pre-vendor design.",
      sensitivity: "none",
      group: "settings",
      describe: literal,
    })
  ),
];

const CATALOGUED = new Set(CATALOG.map((s) => s.key));

// Anything under our prefix that the catalog does not know about — a slot a
// newer build added, or one an older build left. Listed so nothing can hide,
// with its value withheld because we cannot vouch for it either way.
const unknownSlot = (key: string): Slot => ({
  key,
  name: key.replace(/^agent-hub:/, ""),
  holds: "written by a part of this app this screen does not have a description for.",
  sensitivity: "unknown",
  group: "unknown",
});

const readAll = (): Slot[] => {
  let present: string[] = [];
  try {
    present = Object.keys(localStorage).filter((k) => k.startsWith("agent-hub:"));
  } catch {
    /* private mode — nothing is stored, so nothing to list */
  }
  const extra = present.filter((k) => !CATALOGUED.has(k)).sort();
  return [...CATALOG, ...extra.map(unknownSlot)];
};

const rawOf = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const GROUPS: { id: Group; title: string }[] = [
  { id: "credentials", title: "credentials" },
  { id: "state", title: "your rooms & layout" },
  { id: "settings", title: "settings" },
  { id: "unknown", title: "unrecognised" },
];

export default function StoredData({ onClose }: { onClose: () => void }) {
  // localStorage is not reactive, so every mutation bumps this and the whole
  // list is re-read. Cheap, and it cannot drift from what is actually stored.
  const [rev, setRev] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const slots = useMemo(() => readAll().map((s) => ({ slot: s, raw: rawOf(s.key) })), [rev]);
  const filled = slots.filter((r) => r.raw !== null);
  const secrets = filled.filter((r) => r.slot.sensitivity === "secret" || r.slot.sensitivity === "write");

  // Two booleans in the store are read from localStorage once, at boot:
  // brainConnected and commitsArmed. Deleting a credential from under them
  // would leave the strip claiming "brain: live" and "ARMED" over nothing, so
  // both are recomputed after every removal rather than left to a reload.
  const resync = useCallback(() => {
    const hub = useHub.getState();
    hub.setBrainConnected(getKey() !== null);
    hub.setCommitsArmed(rawOf("agent-hub:gh-token") !== null);
    setRev((n) => n + 1);
  }, []);

  // Removing agent-hub:state is the one deletion that cannot stand on its own:
  // the store still holds that state in memory and re-persists on the next
  // set(), and App.tsx:21 ticks the sim every 4.2s — so the slot would silently
  // come back within seconds. Reloading is what makes the delete true.
  const forget = useCallback(
    (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing to remove */
      }
      if (key === "agent-hub:state") {
        location.reload();
        return;
      }
      resync();
    },
    [resync]
  );

  const forgetAll = useCallback(() => {
    const keys = filled.map((r) => r.slot.key);
    for (const k of keys) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    if (keys.includes("agent-hub:state")) {
      location.reload();
      return;
    }
    setConfirming(false);
    resync();
  }, [filled, resync]);

  // Portalled to <body> on purpose. This view is opened from inside the keys
  // panel, and that panel carries .glass — a non-none backdrop-filter makes an
  // element the containing block for its position:fixed descendants, so
  // `inset-0` resolved to the 400px panel instead of the viewport: a scrim that
  // dimmed one column, left the rest of the app live and clickable, and let the
  // card overflow onto the undimmed page. Measured 398x654 before this fix.
  return createPortal(
    <div
      data-testid="stored-data-scrim"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-14"
    >
      <div
        data-testid="stored-data"
        onClick={(e) => e.stopPropagation()}
        className="glass panel-solid flex max-h-[82vh] w-[36rem] max-w-full flex-col rounded-xl p-4"
      >
        <div className="flex items-center gap-2">
          <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">stored in this browser</div>
          <div className="flex-1" />
          <button
            data-testid="stored-close"
            onClick={onClose}
            className="mono cursor-pointer text-[10px] text-slate-500 transition hover:text-slate-200"
          >
            close
          </button>
        </div>

        {/* Said once, plainly, at the top — the question every one of these rows
            raises is "who else has this?". */}
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          None of this is sent anywhere. It lives in this browser's local storage on this machine; keys go straight
          from here to the vendor you set them for, and no server of ours is ever in the path. Deleting a row here
          deletes it — there is no copy elsewhere to restore it from.
        </p>

        <div className="mono mt-2 flex items-center gap-2 text-[9px] tracking-wider text-slate-500 uppercase">
          <span data-testid="stored-count">
            {plural(filled.length, "item")} stored
            {secrets.length > 0 && <span className="text-amber-300/90"> · {plural(secrets.length, "credential")}</span>}
          </span>
          <div className="flex-1" />
          <button
            data-testid="toggle-empty"
            onClick={() => setShowEmpty((v) => !v)}
            className="mono cursor-pointer tracking-wider text-slate-500 uppercase transition hover:text-slate-300"
          >
            {showEmpty ? "hide" : "show"} {slots.length - filled.length} empty
          </button>
        </div>

        <div className="mt-2.5 flex-1 space-y-3 overflow-y-auto pr-1">
          {GROUPS.map(({ id, title }) => {
            const rows = slots.filter((r) => r.slot.group === id && (showEmpty || r.raw !== null));
            if (rows.length === 0) return null;
            return (
              <div key={id}>
                <div className="mono text-[8.5px] tracking-[0.2em] text-slate-600 uppercase">{title}</div>
                <div className="mt-1.5 space-y-1.5">
                  {rows.map(({ slot, raw }) => (
                    <Row key={slot.key} slot={slot} raw={raw} onForget={() => forget(slot.key)} />
                  ))}
                </div>
              </div>
            );
          })}
          {filled.length === 0 && !showEmpty && (
            <p data-testid="stored-empty" className="text-[10.5px] leading-relaxed text-slate-500">
              Nothing stored. This browser holds no keys, no token, and no saved rooms for the hub.
            </p>
          )}
        </div>

        {/* The destructive control names its blast radius before it fires, and
            the second click is a different button in a different place — an
            accidental double-click on the first one cannot reach it. */}
        <div className="mt-3 border-t border-white/10 pt-2.5">
          {!confirming ? (
            <button
              data-testid="forget-everything"
              onClick={() => setConfirming(true)}
              disabled={filled.length === 0}
              className="mono w-full cursor-pointer rounded-lg border border-rose-300/40 bg-rose-400/10 px-2 py-1.5 text-[10.5px] text-rose-200 transition hover:bg-rose-400/25 disabled:cursor-default disabled:border-white/10 disabled:bg-transparent disabled:text-slate-600"
            >
              forget everything
            </button>
          ) : (
            <div data-testid="forget-confirm">
              <p className="text-[10.5px] leading-relaxed text-rose-200">
                This removes {plural(filled.length, "item")} from this browser
                {secrets.length > 0 && (
                  <>
                    , including {plural(secrets.length, "credential")} you will have to paste again
                    {filled.some((r) => r.slot.key === "agent-hub:gh-token") && (
                      <span className="text-rose-100"> — the GitHub write token among them</span>
                    )}
                  </>
                )}
                :
              </p>
              <ul data-testid="forget-manifest" className="mono mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-[9.5px] text-slate-400">
                {filled.map((r) => (
                  <li key={r.slot.key}>· {r.slot.name}</li>
                ))}
              </ul>
              {filled.some((r) => r.slot.key === "agent-hub:state") && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                  The page reloads afterwards — the app is holding your rooms in memory and would write them straight
                  back otherwise.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  data-testid="forget-everything-confirm"
                  onClick={forgetAll}
                  className="mono flex-1 cursor-pointer rounded-lg border border-rose-300/50 bg-rose-400/20 px-2 py-1.5 text-[10.5px] text-rose-100 transition hover:bg-rose-400/35"
                >
                  yes — forget {filled.length}
                </button>
                <button
                  data-testid="forget-everything-cancel"
                  onClick={() => setConfirming(false)}
                  className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10.5px] text-slate-300 transition hover:bg-white/10"
                >
                  keep it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Row({ slot, raw, onForget }: { slot: Slot; raw: string | null; onForget: () => void }) {
  const set = raw !== null;
  const secret = slot.sensitivity === "secret" || slot.sensitivity === "write";
  const danger = slot.sensitivity === "write";
  const opaque = slot.sensitivity === "unknown";

  // The whole promise of this screen, in one expression: a secret contributes
  // nothing to the DOM but the fact that it exists and, when there is enough of
  // it to spare, its last four characters — so two pasted keys can be told
  // apart without either being readable. An unrecognised slot gets not even
  // that: four characters of something we cannot identify is still four
  // characters we did not have to print.
  const value = !set
    ? "not set"
    : opaque
      ? "set · value hidden — this screen can't vouch for what is in it"
      : secret
        ? raw.length >= 12
          ? `set · ends ${raw.slice(-4)}`
          : "set"
        : (slot.describe?.(raw) ?? "set");

  return (
    <div
      data-testid={`stored-row-${slot.key}`}
      className={`rounded-lg border p-2 ${
        !set
          ? "border-white/8 bg-white/[0.01] opacity-60"
          : danger
            ? "border-rose-300/40 bg-rose-400/[0.07]"
            : secret
              ? "border-amber-300/35 bg-amber-400/[0.06]"
              : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[11.5px] ${danger ? "text-rose-100" : secret && set ? "text-amber-100" : "text-slate-200"}`}>
          {slot.name}
        </span>
        {(secret || opaque) && (
          <span
            className={`mono rounded px-1 py-px text-[8px] tracking-wider uppercase ${
              danger ? "bg-rose-400/15 text-rose-200" : opaque ? "bg-white/8 text-slate-400" : "bg-amber-400/15 text-amber-200"
            }`}
          >
            {danger ? "can change a repo" : opaque ? "unrecognised" : "secret"}
          </span>
        )}
        <div className="flex-1" />
        {set && (
          <button
            data-testid={`stored-forget-${slot.key}`}
            onClick={onForget}
            title={`Remove ${slot.key} from this browser`}
            className="mono cursor-pointer rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9.5px] text-slate-400 transition hover:border-rose-300/40 hover:text-rose-300"
          >
            forget
          </button>
        )}
      </div>
      <div className="mono mt-0.5 text-[8.5px] text-slate-600">{slot.key}</div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{slot.holds}</p>
      <div
        data-testid={`stored-value-${slot.key}`}
        className={`mono mt-1 text-[9.5px] ${set ? (secret ? "text-amber-200/90" : opaque ? "text-slate-400" : "text-teal-200/90") : "text-slate-600"}`}
      >
        {value}
      </div>
      {slot.note && set && (
        <p className={`mt-1 text-[9.5px] leading-relaxed ${danger ? "text-rose-200/90" : "text-slate-500"}`}>{slot.note}</p>
      )}
    </div>
  );
}
