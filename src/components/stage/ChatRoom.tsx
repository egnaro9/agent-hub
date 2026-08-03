import { useEffect, useRef, useState } from "react";
import { useHub, agentInScope } from "../../state/hub";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const queueLen = channel?.queue.length ?? 0;
  const hasQueue = queueLen > 0;

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
              <button
                key={a.id}
                onClick={() => useHub.getState().removeFromRoom(projectId, a.id)}
                title={`${a.name} — ${a.role} · click to release from this room`}
                className="grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-full text-[9px] font-bold text-white transition hover:opacity-50"
                style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}88, #0b1120 78%)`, border: `1.5px solid ${a.color}` }}
              >
                {a.glyph}
              </button>
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
            const label = `${m.action.tool}(${Object.values(m.action.input).map(String).join(", ")})`;
            return (
              <div key={m.id} className="-mx-2 my-1 rounded-xl border border-amber-300/40 bg-amber-400/8 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
                  <span className="text-[12px] text-slate-200">
                    <span style={{ color: a.color }}>{a.name}</span> proposes <code className="mono text-[11px] text-amber-200">{label}</code>
                  </span>
                </div>
                <div className="mono mt-1 text-[9px] tracking-[0.15em] text-amber-300/70 uppercase">gated · operator approval required · agents cannot self-approve</div>
                {m.action.status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => useHub.getState().approveAction(projectId, m.id)}
                      className="mono cursor-pointer rounded-lg border border-teal-300/50 bg-teal-400/15 px-3 py-1 text-[10.5px] text-teal-200 transition hover:bg-teal-400/30"
                    >
                      approve ▸
                    </button>
                    <button
                      onClick={() => useHub.getState().dismissAction(projectId, m.id)}
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
            placeholder={`Message #${project.name} — @${members[0]?.name ?? "an agent"} or @team to direct it`}
            className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder-slate-500 outline-none"
          />
          <button onClick={submit} className="mono cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-2.5 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-400/30">
            send
          </button>
        </div>
      </footer>
    </div>
  );
}
