import { Handle, Position } from "@xyflow/react";
import { motion } from "framer-motion";
import { useHub } from "../../state/hub";

export default function ProjectNode({ id }: { id: string }) {
  const project = useHub((s) => s.projects.find((p) => p.id === id));
  const agents = useHub((s) => s.agents);
  const assignments = useHub((s) => s.assignments);
  const openStage = useHub((s) => s.openStage);
  if (!project) return null;
  const workedBy = agents.filter((a) => assignments[a.id] === id);

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      onClick={() => openStage(project.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openStage(project.id);
        }
      }}
      aria-label={`Open ${project.name}`}
      className="glass w-[196px] cursor-pointer rounded-xl p-3"
      style={{
        borderLeft: `3px solid ${project.hue}`,
        boxShadow: workedBy.length ? `0 0 26px ${project.hue}44` : "0 6px 24px rgba(0,0,0,.35)",
      }}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div className="flex items-center justify-between gap-2">
        <span className="mono truncate text-[12.5px] font-semibold text-slate-100">{project.name}</span>
        {workedBy.length > 0 && (
          <span className="flex -space-x-1">
            {workedBy.map((a) => (
              <span
                key={a.id}
                className="grid h-4.5 w-4.5 place-items-center rounded-full text-[8px] font-bold text-white"
                style={{ background: a.color, border: "1.5px solid #0b1120" }}
                title={`${a.name} is working here`}
              >
                {a.glyph}
              </span>
            ))}
          </span>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-slate-400">{project.tagline}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {project.langs.map((l) => (
          <span key={l} className="mono rounded border border-white/10 bg-white/5 px-1.5 py-px text-[8.5px] text-slate-400">
            {l}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
