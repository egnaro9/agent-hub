import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

// A glowing, flowing edge for live relationships: an agent working a project,
// or agents in conversation. Structural repo links use the default edge.
export default function PulseEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });
  const color = (props.data?.color as string) ?? "#22d3ee";
  return (
    <>
      {/* Nudged up alongside the structural edges' lift (HubCanvas) so the
          hierarchy holds: work edges must stay unmistakably ABOVE them. */}
      <BaseEdge id={`${props.id}-halo`} path={path} style={{ stroke: color, strokeWidth: 7, opacity: 0.16 }} />
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: 2.1,
          opacity: 0.95,
          strokeDasharray: "7 7",
          animation: "dashflow 0.7s linear infinite",
          filter: `drop-shadow(0 0 5px ${color})`,
        }}
      />
    </>
  );
}
