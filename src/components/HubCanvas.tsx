import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import AgentNode from "./nodes/AgentNode";
import ProjectNode from "./nodes/ProjectNode";
import PulseEdge from "./edges/PulseEdge";
import { useHub } from "../state/hub";

const nodeTypes = {
  agent: (p: { id: string }) => <AgentNode id={p.id} />,
  project: (p: { id: string }) => <ProjectNode id={p.id} />,
};
const edgeTypes = { pulse: PulseEdge };

// Node identity and position are React Flow's; everything the nodes DISPLAY
// (status, assignments, tray) lives in the store and is read by id inside the
// node components — so nodes never need re-creation when the sim ticks.
// Seeded from the HYDRATED store (not the mock module) so persisted positions
// and operator-created projects are there from the first frame.
const makeInitialNodes = (): Node[] => {
  const s = useHub.getState();
  return [
    ...s.projects.map((p) => ({ id: p.id, type: "project", position: p.pos, data: {} })),
    ...s.agents.map((a) => ({ id: a.id, type: "agent", position: a.pos, data: {}, zIndex: 10 })),
  ];
};

export default function HubCanvas() {
  const agents = useHub((s) => s.agents);
  const structural = useHub((s) => s.structural);
  const assignments = useHub((s) => s.assignments);
  const conversation = useHub((s) => s.conversation);
  const focusRequest = useHub((s) => s.focusRequest);
  const moveNode = useHub((s) => s.moveNode);
  const mapLocked = useHub((s) => s.mapLocked);
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(useMemo(makeInitialNodes, []));

  // Projects created at runtime (chat's "new project:") must reach the canvas —
  // the node list is otherwise a one-time snapshot (critic BLOCKER). Existing
  // node positions are preserved; only genuinely new ids are appended.
  const projects = useHub((s) => s.projects);
  useEffect(() => {
    setNodes((prev) => {
      const have = new Set(prev.map((n) => n.id));
      const added = projects
        .filter((p) => !have.has(p.id))
        .map((p) => ({ id: p.id, type: "project", position: p.pos, data: {} }));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [projects, setNodes]);

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = structural.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: "rgba(148,183,255,.16)", strokeWidth: 1.2 },
      labelStyle: { fill: "#526580", fontSize: 9, fontFamily: "ui-monospace, monospace" },
      labelBgStyle: { fill: "transparent" },
    }));
    const work: Edge[] = Object.entries(assignments).map(([agentId, projectId]) => {
      const agent = agents.find((a) => a.id === agentId);
      return {
        id: `work-${agentId}`,
        source: agentId,
        target: projectId,
        type: "pulse",
        data: { color: agent?.color ?? "#22d3ee" },
      };
    });
    const talk: Edge[] = [];
    if (conversation && conversation.kind === "roundtable") {
      const ps = conversation.participants;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          talk.push({
            id: `talk-${ps[i]}-${ps[j]}`,
            source: ps[i],
            target: ps[j],
            type: "pulse",
            data: { color: "#e2e8f0" },
          });
        }
      }
    }
    return [...base, ...work, ...talk];
  }, [structural, assignments, agents, conversation]);

  useEffect(() => {
    if (!focusRequest) return;
    rf.setCenter(focusRequest.pos.x + 80, focusRequest.pos.y + 60, { zoom: 1.05, duration: 700 });
  }, [focusRequest, rf]);

  return (
    <div className="h-full w-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => moveNode(node.id, node.position)}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      // LOCKED means: the layout and the zoom level stop moving on you.
      // Trackpad scroll-zoom and double-click-zoom are the things that were
      // resizing the map unbidden, so those go off; drag-to-pan stays on so you
      // can still walk around, and the +/−/fit buttons still work deliberately.
      // Nodes stop being draggable so a pan can't nudge a card by accident.
      nodesDraggable={!mapLocked}
      zoomOnScroll={!mapLocked}
      zoomOnPinch={!mapLocked}
      zoomOnDoubleClick={!mapLocked}
      panOnScroll={false}
      minZoom={0.25}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      deleteKeyCode={null}
    >
      <Background variant={BackgroundVariant.Dots} gap={36} size={1} color="rgba(148,183,255,.14)" />
      <MiniMap
        pannable
        zoomable
        position="bottom-left"
        style={{ background: "rgba(8,12,24,.92)", width: 190, height: 130 }}
        nodeColor={(n) => (n.type === "agent" ? "#7dd3fc" : "#2b3b55")}
        nodeStrokeWidth={0}
        maskColor="rgba(5,7,15,.72)"
      />
      {/* React Flow's own Controls are replaced by the HUD's horizontal cluster
          (zoom / fit / lock together), so the stack no longer sits on the hint. */}
    </ReactFlow>
    </div>
  );
}
