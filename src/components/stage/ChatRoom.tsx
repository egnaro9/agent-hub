import { useEffect, useRef, useState } from "react";
import { useHub, agentInScope } from "../../state/hub";
import MicButton from "../MicButton";

// Minimal line diff for the commit card: enough to see what changes, with
// unchanged runs collapsed. The operator approves what this shows.
type DiffLine = { kind: "add" | "del" | "ctx" | "gap"; text: string };
function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after.split("\n");
  const bSet = new Set(b);
  const aSet = new Set(a);
  const out: DiffLine[] = [];
  let same = 0;
  const flushGap = () => {
    if (same > 3) out.push({ kind: "gap", text: `  … ${same - 2} unchanged lines` });
    same = 0;
  };
  for (const line of a) if (!bSet.has(line)) out.push({ kind: "del", text: `- ${line}` });
  for (const line of b) {
    if (aSet.has(line)) {
      same++;
      if (same <= 2) out.push({ kind: "ctx", text: `  ${line}` });
    } else {
      flushGap();
      out.push({ kind: "add", text: `+ ${line}` });
    }
  }
  flushGap();
  return out.slice(0, 200);
}

// Render @-mentions in the speaker's accent so routing is visible.
function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[\w-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="rounded bg-cyan-400/15 px-1 text-cyan-200">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

// The project channel — a team room, Discord-shaped: flat rows, names in the
// speaker's color, typing indicator, interject any time.
export default function ChatRoom({ projectId }: { projectId: string }) {
  const project = useHub((s) => s.projects.find((p) => p.id === projectId));
  const channel = useHub((s) => s.channels[projectId]);
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const advanceChannel = useHub((s) => s.advanceChannel);
  const sendToChannel = useHub((s) => s.sendToChannel);
  const assign = useHub((s) => s.assign);
  const [draft, setDraft] = useState("");
  // Dictation replaces only what it added, so anything typed first survives.
  const dictationBase = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queueLen = channel?.queue.length ?? 0;
  const hasQueue = queueLen > 0;
  // An agent is mid-reply if there is anything left to say, or the tail
  // message is still streaming its characters in.
  const lastMsg = channel?.messages[channel.messages.length - 1];
  const writing = hasQueue || Boolean(lastMsg?.streaming);

  useEffect(() => {
    if (!hasQueue) return;
    const t = setInterval(() => advanceChannel(projectId), 1500);
    return () => clearInterval(t);
  }, [hasQueue, projectId, advanceChannel]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [channel?.messages.length, queueLen]);

  if (!project || !channel) return null;

  const members = channel.participants.map((id) => agents.find((a) => a.id === id)!).filter(Boolean);
  const outside = agents.filter(
    (a) => agentInScope(a, projectId) && !channel.participants.includes(a.id) && assignments[a.id] !== projectId
  );
  const speaking = hasQueue ? agents.find((a) => a.id === channel.queue[0].from) : undefined;

  const submit = () => {
    if (!draft.trim()) return;
    sendToChannel(projectId, draft.trim());
    setDraft("");
    dictationBase.current = "";
  };

  // Approving or dismissing removes the buttons from the DOM, which drops focus
  // onto <body>. Hand it to the composer — the natural next thing to do.
  const resolveAction = (fn: () => void) => {
    fn();
    inputRef.current?.focus();
  };

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="mono truncate text-[13px] font-semibold text-slate-100">
            <span style={{ color: project.hue }}>#</span> {project.name}
          </div>
          <div className="mono mt-0.5 text-[9px] tracking-wider text-slate-500 uppercase">
            {members.length > 0 ? `${members.length} in the room` : "no one here yet — summon an agent"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex -space-x-1.5">
            {members.map((a) => (
              // The avatar itself is not a target — releasing an agent hides
              // behind a small × so a misclick can't quietly empty the room.
              <span key={a.id} className="group/av relative">
                <span
                  title={`${a.name} — ${a.role}`}
                  className="grid h-6.5 w-6.5 place-items-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}88, #0b1120 78%)`, border: `1.5px solid ${a.color}` }}
                >
                  {a.glyph}
                </span>
                <button
                  onClick={() => useHub.getState().removeFromRoom(projectId, a.id)}
                  title={`Release ${a.name} from this room`}
                  aria-label={`Release ${a.name} from this room`}
                  className="mono absolute -top-1 -right-1 grid h-3.5 w-3.5 cursor-pointer place-items-center rounded-full border border-rose-300/60 bg-slate-950 text-[8px] leading-none text-rose-300 opacity-0 transition pointer-events-none group-hover/av:pointer-events-auto group-hover/av:opacity-100 hover:bg-rose-400/25 focus-visible:pointer-events-auto focus-visible:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </span>
          {outside.map((a) => (
            <button
              key={a.id}
              onClick={() => assign(a.id, projectId)}
              title={`Summon ${a.name} — ${a.role}`}
              className="mono grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-full border border-dashed border-white/25 text-[9px] text-slate-500 transition hover:border-white/60 hover:text-slate-200"
            >
              {a.glyph}
            </button>
          ))}
        </div>
      </header>

      {/* Live region sits on the scroll container, not a wrapper around the whole
          panel: only rows added after mount are announced, never the backlog. */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-label={`#${project.name} messages`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {channel.messages.length === 0 && !speaking && (
          <div className="mono mt-6 text-center text-[11px] leading-relaxed text-slate-600">
            This is the start of <span style={{ color: project.hue }}>#{project.name}</span>.
            <br />
            Summon agents with the dashed buttons above, or just say something.
          </div>
        )}
        {channel.messages.map((m) => {
          if (m.from === "user") {
            return (
              <div key={m.id} className="group -mx-2 flex gap-2.5 rounded-lg bg-cyan-400/6 px-2 py-1.5">
                <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border border-cyan-300/50 bg-cyan-400/15 text-[9px] font-bold text-cyan-100">
                  you
                </span>
                <div className="min-w-0">
                  <div className="mono text-[9.5px] tracking-wider text-cyan-300 uppercase">operator</div>
                  <div className="text-[13px] leading-relaxed text-cyan-50"><MentionText text={m.text} /></div>
                </div>
              </div>
            );
          }
          const a = agents.find((x) => x.id === m.from)!;
          if (m.action) {
            const isCommit = m.action.tool === "propose_commit";
            const inp = m.action.input as { path?: string; content?: string; message?: string; why?: string };
            const label = isCommit
              ? `propose_commit(${inp.path ?? "?"})`
              : `${m.action.tool}(${Object.values(m.action.input).map(String).join(", ")})`;
            const diff = isCommit ? lineDiff(m.action.before ?? "", String(inp.content ?? "")) : null;
            return (
              <div key={m.id} className="-mx-2 my-1 rounded-xl border border-amber-300/40 bg-amber-400/8 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
                  <span className="text-[12px] text-slate-200">
                    <span style={{ color: a.color }}>{a.name}</span> proposes <code className="mono text-[11px] text-amber-200">{label}</code>
                  </span>
                </div>
                <div className="mono mt-1 text-[9px] tracking-[0.15em] text-amber-300/70 uppercase">
                  gated · operator approval required · agents cannot self-approve
                  {isCommit && " · writes to a NEW BRANCH, never main"}
                </div>
                {isCommit && (
                  <>
                    <div className="mono mt-2 text-[11px] text-slate-300">
                      <span className="text-slate-500">commit:</span> {inp.message}
                    </div>
                    {inp.why && <div className="mt-0.5 text-[11px] text-slate-400">{inp.why}</div>}
                    {diff && (
                      <pre className="mono mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[10.5px] leading-[1.45]">
                        {diff.map((d, i) => (
                          <div
                            key={i}
                            className={
                              d.kind === "add"
                                ? "text-teal-300"
                                : d.kind === "del"
                                  ? "text-rose-300"
                                  : d.kind === "gap"
                                    ? "text-slate-600"
                                    : "text-slate-500"
                            }
                          >
                            {d.text}
                          </div>
                        ))}
                      </pre>
                    )}
                  </>
                )}
                {m.action.status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => resolveAction(() => useHub.getState().approveAction(projectId, m.id))}
                      aria-label={`Approve ${label}`}
                      className="mono cursor-pointer rounded-lg border border-teal-300/50 bg-teal-400/15 px-3 py-1 text-[10.5px] text-teal-200 transition hover:bg-teal-400/30"
                    >
                      approve ▸
                    </button>
                    <button
                      onClick={() => resolveAction(() => useHub.getState().dismissAction(projectId, m.id))}
                      aria-label={`Dismiss ${label}`}
                      className="mono cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[10.5px] text-slate-400 transition hover:text-rose-300"
                    >
                      dismiss
                    </button>
                  </div>
                ) : (
                  <div className={`mono mt-1.5 text-[10px] ${m.action.status === "approved" ? "text-teal-300" : "text-slate-500"}`}>
                    {m.action.status === "approved" ? "✓ approved by operator" : "dismissed by operator"}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={m.id} className="group -mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/3">
              <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}88, #0b1120 78%)`, border: `1.5px solid ${a.color}` }}>
                {a.glyph}
              </span>
              <div className="min-w-0">
                <div className="mono text-[9.5px] tracking-wider uppercase" style={{ color: a.color }}>
                  {a.name} <span className="text-slate-600 normal-case">· {a.role.split("—")[0].trim()}</span>
                </div>
                <div className="text-[13px] leading-relaxed text-slate-200">
                  <MentionText text={m.text} />
                  {m.streaming && <span className="breathe ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-teal-300/80" />}
                </div>
              </div>
            </div>
          );
        })}

        {speaking && (
          <div className="-mx-2 flex items-center gap-2.5 px-2 py-1.5">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: `radial-gradient(circle at 32% 28%, ${speaking.color}88, #0b1120 78%)`, border: `1.5px solid ${speaking.color}` }}>
              {speaking.glyph}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="mono text-[10px]" style={{ color: speaking.color }}>{speaking.name} is typing</span>
              <span className="typing-dot h-1 w-1 rounded-full bg-slate-400" />
              <span className="typing-dot h-1 w-1 rounded-full bg-slate-400" />
              <span className="typing-dot h-1 w-1 rounded-full bg-slate-400" />
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-cyan-300/50">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
            placeholder={`Message #${project.name} — @${members[0]?.name ?? "an agent"} or @team to direct it`}
            className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder-slate-500 outline-none"
          />
          {/* Stays enabled while an agent writes — interjecting mid-reply is the
              point of the room; the button just says what's happening. */}
          <MicButton
            onStart={() => (dictationBase.current = draft)}
            onTranscript={(text, final) => {
              const base = dictationBase.current;
              setDraft((base && text ? `${base} ${text}` : base + text).trimStart());
              if (final) dictationBase.current = "";
            }}
          />
          <button
            onClick={submit}
            aria-label={writing ? "Send — an agent is writing" : "Send"}
            className={`mono cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] transition ${
              writing
                ? "border-teal-300/30 bg-teal-400/10 text-teal-200/80 hover:bg-teal-400/20"
                : "border-cyan-300/40 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/30"
            }`}
          >
            {writing ? (
              <span className="flex items-center gap-1.5">
                <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-teal-300" />
                writing…
              </span>
            ) : (
              "send"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
