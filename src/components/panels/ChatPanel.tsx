import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHub } from "../../state/hub";

export default function ChatPanel() {
  const live = useHub((s) => s.conversation);
  // Hold the last non-null conversation so AnimatePresence can actually play
  // the exit spring after the store clears it (critic finding).
  const heldRef = useRef(live);
  if (live) heldRef.current = live;
  const conversation = live ?? heldRef.current;
  const agents = useHub((s) => s.agents);
  const topic = useHub((s) => s.projects.find((p) => p.id === s.conversation?.topicId));
  const advance = useHub((s) => s.advance);
  const sendUser = useHub((s) => s.sendUser);
  const closePanels = useHub((s) => s.closePanels);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const queueLen = conversation?.queue.length ?? 0;

  useEffect(() => {
    if (!conversation || queueLen === 0) return;
    const t = setInterval(advance, 1500);
    return () => clearInterval(t);
  }, [conversation?.id, queueLen > 0, advance]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length]);

  if (!conversation) return null;
  const participants = conversation.participants.map((id) => agents.find((a) => a.id === id)!);
  const speaking = queueLen > 0 ? agents.find((a) => a.id === conversation.queue[0].from) : undefined;
  const title = conversation.kind === "solo" ? participants[0].name : participants.map((a) => a.name).join(" × ");

  const submit = () => {
    if (!draft.trim()) return;
    sendUser(draft.trim());
    setDraft("");
  };

  return (
    <motion.aside
      initial={{ x: 440, opacity: 0.4 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 440, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversation with ${title}`}
      className="glass absolute top-0 right-0 z-30 flex h-full w-[min(400px,90vw)] flex-col rounded-l-2xl"
    >
      <header className="flex items-center justify-between border-b border-white/10 p-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {participants.map((a) => (
              <span key={a.id} className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: `radial-gradient(circle at 32% 28%, ${a.color}88, #0b1120 78%)`, border: `1.5px solid ${a.color}` }}>
                {a.glyph}
              </span>
            ))}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-100">{title}</div>
            <div className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">
              {conversation.kind === "solo" ? participants[0].role : topic ? `roundtable · ${topic.name}` : "roundtable"}
            </div>
          </div>
        </div>
        <button onClick={closePanels} className="mono cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10">esc</button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {conversation.messages.map((m) => {
          if (m.from === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md border border-cyan-300/30 bg-cyan-400/10 px-3.5 py-2 text-[13px] leading-relaxed text-cyan-50">
                  {m.text}
                </div>
              </div>
            );
          }
          const a = agents.find((x) => x.id === m.from)!;
          return (
            <div key={m.id} className="flex gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
              <div className="max-w-[85%]">
                {conversation.kind === "roundtable" && (
                  <div className="mono mb-0.5 text-[9px] tracking-wider uppercase" style={{ color: a.color }}>{a.name}</div>
                )}
                <div className="rounded-2xl rounded-tl-md border border-white/10 bg-white/5 px-3.5 py-2 text-[13px] leading-relaxed text-slate-200">
                  {m.text}
                  {m.streaming && <span className="breathe ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-teal-300/80" />}
                </div>
              </div>
            </div>
          );
        })}

        {speaking && (
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: speaking.color }}>{speaking.glyph}</span>
            <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
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
            placeholder={conversation.kind === "solo" ? `Message ${participants[0].name}…` : "Interject…"}
            className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder-slate-500 outline-none"
          />
          <button onClick={submit} className="mono cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-2.5 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-400/30">
            send
          </button>
        </div>
      </footer>
    </motion.aside>
  );
}
