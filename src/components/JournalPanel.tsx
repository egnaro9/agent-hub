import { useState } from "react";
import { createPortal } from "react-dom";
import { clearJournal, journalJSON, useJournal, type JournalEntry } from "../state/journal";

// The operator's ledger, on screen. The transcript forgets (80 messages per
// room when it persists); this panel reads the append-only journal slice that
// doesn't. One row per gate proposal and its outcome, per commit (branch and
// URL, or the refusal), per shape run (quoted vs actual spend), and per
// danger-zone arm/disarm. Newest first, because the question that opens this
// panel is almost always "what just happened?".

const when = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

const OUTCOME_CLS: Record<string, string> = {
  proposed: "text-amber-200 border-amber-300/40 bg-amber-400/10",
  approved: "text-teal-200 border-teal-300/40 bg-teal-400/10",
  dismissed: "text-slate-400 border-white/15 bg-white/5",
};

function Row({ e }: { e: JournalEntry }) {
  if (e.kind === "gate") {
    return (
      <>
        <span className={`mono rounded border px-1.5 py-px text-[8.5px] tracking-wider uppercase ${OUTCOME_CLS[e.outcome]}`}>
          {e.outcome}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
          <span className="text-slate-500">{e.agent} · #{e.project} · </span>
          <code className="mono text-[10.5px]">{e.tool}({e.detail})</code>
        </span>
      </>
    );
  }
  if (e.kind === "commit") {
    return (
      <>
        <span
          className={`mono rounded border px-1.5 py-px text-[8.5px] tracking-wider uppercase ${
            e.error ? "border-rose-300/40 bg-rose-400/10 text-rose-200" : "border-teal-300/40 bg-teal-400/10 text-teal-200"
          }`}
        >
          {e.error ? "refused" : "commit"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
          <span className="text-slate-500">{e.agent} · #{e.project} · </span>
          {e.error ? (
            <span className="text-rose-200/80">{e.message} — {e.error}</span>
          ) : (
            <a href={e.url} target="erikhill-out" rel="noreferrer noopener" className="text-cyan-200 underline decoration-cyan-200/40 hover:decoration-cyan-200">
              {e.branch}
            </a>
          )}
          {!e.error && <span className="text-slate-500"> · {e.message}</span>}
        </span>
      </>
    );
  }
  if (e.kind === "run") {
    const over = e.spent > e.quoted;
    return (
      <>
        <span className="mono rounded border border-cyan-300/40 bg-cyan-400/10 px-1.5 py-px text-[8.5px] tracking-wider text-cyan-200 uppercase">
          run
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
          <span className="text-slate-500">#{e.project} · </span>
          {e.label}
          <span className={over ? "text-amber-200" : "text-slate-500"}>
            {" "}· quoted {e.quoted}+ · spent {e.spent}
            {over && " (over)"}
          </span>
        </span>
      </>
    );
  }
  return (
    <>
      <span
        className={`mono rounded border px-1.5 py-px text-[8.5px] tracking-wider uppercase ${
          e.on ? "border-rose-300/40 bg-rose-400/10 text-rose-200" : "border-white/15 bg-white/5 text-slate-400"
        }`}
      >
        {e.on ? "armed" : "disarmed"}
      </span>
      <span className="flex-1 text-[11px] text-slate-400">
        commit proposals {e.on ? "enabled — the write tool exists while this is on" : "disabled"}
      </span>
    </>
  );
}

export default function JournalPanel({ onClose }: { onClose: () => void }) {
  const rows = useJournal();
  const [confirming, setConfirming] = useState(false);

  const exportJson = () => {
    const blob = new Blob([journalJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-hub-journal.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Portalled to <body> for the same reason StoredData is: this can be opened
  // from inside a .glass panel, whose backdrop-filter would otherwise become
  // the containing block for this fixed scrim.
  return createPortal(
    <div
      data-testid="journal-scrim"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-14"
    >
      <div
        data-testid="journal-panel"
        onClick={(e) => e.stopPropagation()}
        className="glass panel-solid flex max-h-[82vh] w-[38rem] max-w-full flex-col rounded-xl p-4"
      >
        <div className="flex items-center gap-2">
          <div className="mono text-[9px] tracking-[0.2em] text-slate-400 uppercase">operator journal</div>
          <div className="flex-1" />
          <button
            data-testid="journal-close"
            onClick={onClose}
            className="mono cursor-pointer text-[10px] text-slate-500 transition hover:text-slate-200"
          >
            close
          </button>
        </div>

        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          Every gate proposal and its outcome, every commit's branch, every shape run's quoted-vs-actual spend, and
          every arming of the danger zone — kept separately from the chat, which forgets. Append-only, capped at 500
          rows, stored only in this browser.
        </p>

        <div className="mono mt-2 flex items-center gap-2 text-[9px] tracking-wider text-slate-500 uppercase">
          <span data-testid="journal-count">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
          <div className="flex-1" />
          <button
            data-testid="journal-export"
            onClick={exportJson}
            disabled={rows.length === 0}
            className="mono cursor-pointer text-[9.5px] text-cyan-300/90 transition hover:text-cyan-200 disabled:cursor-default disabled:text-slate-600"
          >
            export JSON
          </button>
          {confirming ? (
            <button
              data-testid="journal-clear-confirm"
              onClick={() => {
                clearJournal();
                setConfirming(false);
              }}
              className="mono cursor-pointer text-[9.5px] text-rose-300 transition hover:text-rose-200"
            >
              really clear — no copy exists
            </button>
          ) : (
            <button
              data-testid="journal-clear"
              onClick={() => setConfirming(true)}
              disabled={rows.length === 0}
              className="mono cursor-pointer text-[9.5px] text-slate-500 transition hover:text-rose-300 disabled:cursor-default disabled:text-slate-600"
            >
              clear
            </button>
          )}
        </div>

        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {rows.length === 0 && (
            <p className="py-6 text-center text-[11px] text-slate-500">
              Nothing yet — the first gate proposal, shape run, commit or arming writes the first row.
            </p>
          )}
          {[...rows].reverse().map((e, i) => (
            <div
              key={`${e.at}-${i}`}
              data-testid="journal-row"
              className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-2 py-1.5"
            >
              <span className="mono w-24 flex-none text-[9px] text-slate-600">{when(e.at)}</span>
              <Row e={e} />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
