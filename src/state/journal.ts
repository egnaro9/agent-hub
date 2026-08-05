import { useSyncExternalStore } from "react";

// The operator's ledger. The chat transcript is capped at 80 messages per room
// when it persists, so an approved gate card eventually scrolls off its own
// record — the only audit trail the console had was one that erases itself.
// This slice is the part that must NOT erase: one append-only row per thing an
// operator would want to answer for later — a proposal and its outcome, a
// commit's branch and URL, a shape run's quoted-vs-actual spend, the danger
// zone arming and disarming.
//
// Deliberately its OWN localStorage key, not a field in the app-state blob:
// the blob is written wholesale on every streamed token, which is exactly the
// stale-snapshot overwrite that once reverted an approved card. The journal
// never writes a cached copy — every append re-reads storage first — so one
// tab cannot blindly clobber rows another tab just wrote.

export type JournalEntry =
  | {
      at: string;
      kind: "gate";
      project: string;
      agent: string;
      tool: string;
      /** What was proposed, in one line — a path, a project name. */
      detail: string;
      outcome: "proposed" | "approved" | "dismissed";
    }
  | {
      at: string;
      kind: "commit";
      project: string;
      agent: string;
      branch: string;
      url: string;
      message: string;
      /** Set when the approved commit was REFUSED by the write path — an
       *  approval with no commit row would otherwise be ambiguous forever. */
      error?: string;
    }
  | { at: string; kind: "run"; project: string; shape: string; label: string; quoted: number; spent: number }
  | { at: string; kind: "arm"; on: boolean };

export const JOURNAL_KEY = "agent-hub:journal";

// ~500 rows is weeks of real operating history. If the cap ever can't hold a
// week, the roadmap says stop and reconsider — don't grow rotation infra here.
const CAP = 500;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// The panel re-renders on appends from THIS tab via `notify`; appends from
// another tab arrive as storage events, which React subscribes to below.
if (typeof addEventListener === "function") {
  addEventListener("storage", (e) => {
    if (e.key === JOURNAL_KEY) notify();
  });
}

export const readJournal = (): JournalEntry[] => {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : [];
  } catch {
    return [];
  }
};

// Omit does not distribute over a union (it keeps only the KEYS the variants
// share), so a plain Omit<JournalEntry, "at"> silently deleted every
// variant-specific field. Distribute manually.
type Loose<T> = T extends unknown ? Omit<T, "at"> & { at?: string } : never;

export const appendJournal = (entry: Loose<JournalEntry>) => {
  try {
    const rows = readJournal();
    rows.push({ at: new Date().toISOString(), ...entry } as JournalEntry);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(rows.slice(-CAP)));
  } catch {
    /* private mode — the ledger simply doesn't survive, same as everything else */
  }
  notify();
};

export const clearJournal = () => {
  try {
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    /* ignore */
  }
  notify();
};

/** The export IS the stored bytes, pretty-printed — nothing added, nothing scrubbed. */
export const journalJSON = (): string => JSON.stringify(readJournal(), null, 2);

// A monotonically bumped snapshot for useSyncExternalStore: the array identity
// only changes when the journal does, so subscribers don't re-render per paint.
let cache: { raw: string | null; rows: JournalEntry[] } = { raw: null, rows: [] };
const snapshot = (): JournalEntry[] => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(JOURNAL_KEY);
  } catch {
    /* private mode */
  }
  if (raw !== cache.raw) cache = { raw, rows: readJournal() };
  return cache.rows;
};

export const useJournal = (): JournalEntry[] =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => [] as JournalEntry[]
  );
