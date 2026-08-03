import { Handle, Position } from "@xyflow/react";
import { motion } from "framer-motion";
import { useHub } from "../../state/hub";

export default function AgentNode({ id }: { id: string }) {
  const agent = useHub((s) => s.agents.find((a) => a.id === id));
  const projects = useHub((s) => s.projects);
  const project =
    agent?.status.kind === "working"
      ? projects.find((p) => agent.status.kind === "working" && p.id === agent.status.projectId)
      : undefined;
  const inTray = useHub((s) => s.tray.includes(id));
  const openChat = useHub((s) => s.openChat);
  const toggleTray = useHub((s) => s.toggleTray);
  if (!agent) return null;

  const active = agent.status.kind === "thinking" || agent.status.kind === "talking";
  const statusText =
    agent.status.kind === "idle"
      ? "idle"
      : agent.status.kind === "thinking"
        ? agent.status.note
        : agent.status.kind === "talking"
          ? "in session"
          : `on ${project?.name ?? "…"}`;
  const dot =
    agent.status.kind === "idle" ? "#64748b" : agent.status.kind === "working" ? agent.color : "#e2e8f0";

  return (
    <motion.div whileHover={{ scale: 1.05 }} className="relative w-[164px] select-none">
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {active && (
            <span
              className="ping-ring absolute inset-0 rounded-full border-2"
              style={{ borderColor: agent.color }}
            />
          )}
          <div
            className="relative grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${agent.color}66, #0b1120 72%)`,
              border: `2px solid ${agent.color}`,
              boxShadow: `0 0 22px ${agent.color}55, inset 0 0 14px ${agent.color}33`,
            }}
          >
            {agent.glyph}
          </div>
          <span
            className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0b1120]"
            style={{ background: dot }}
          />
        </div>

        <div className="text-center">
          <div className="mono text-[13px] font-semibold tracking-wide text-slate-100">{agent.name}</div>
          <div
            className="mono mt-1 max-w-[160px] truncate rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: `${agent.color}55`, color: `${agent.color}dd`, background: `${agent.color}14` }}
            title={agent.role}
          >
            {statusText}
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); openChat(agent.id); }}
            className="mono cursor-pointer rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-200 transition hover:border-white/40 hover:bg-white/10"
          >
            chat
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleTray(agent.id); }}
            className="mono cursor-pointer rounded-md border px-2.5 py-1 text-[10px] transition"
            style={
              inTray
                ? { borderColor: agent.color, color: "#05070f", background: agent.color }
                : { borderColor: "rgba(255,255,255,.15)", color: "#e2e8f0", background: "rgba(255,255,255,.05)" }
            }
            title="Add to roundtable"
          >
            {inTray ? "✓" : "+"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
