import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Node, type Edge } from "reactflow";

import type { ConversationTreeResponse, UUID } from "../api/types";
import { simpleVerticalLayout } from "./treeLayout";

function snippet(text: string, max = 120): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function TreeView(props: {
  tree: ConversationTreeResponse;
  selectedMessageId: UUID | null;
  onSelectMessage: (id: UUID) => void;
  noteHostSelectionMode?: boolean;
  onNoteHostSelect?: (id: UUID) => void;
}) {
  const { messages, notes, active_state } = props.tree;

  const nodesAndEdges = useMemo(() => {
    const layout = new Map(simpleVerticalLayout(messages).map((n) => [n.id, n]));

    const nodes: Node[] = messages.map((m) => {
      const pos = layout.get(m.id) ?? { x: 0, y: 0 };
      const isActive = m.id === active_state.active_message_id;
      const isSelected = m.id === props.selectedMessageId;
      const noteCount = notes[m.id]?.length ?? 0;

      const baseColor = m.role === "llm" ? "#0ea5e9" : "#64748b";
      const borderColor = isSelected ? "#2563eb" : baseColor;
      const background = isActive ? "#ecfeff" : "#ffffff";

      return {
        id: m.id,
        position: { x: pos.x, y: pos.y },
        data: {
          label: (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="badge">{m.role.toUpperCase()}</span>
                {noteCount > 0 ? <span className="badge">{noteCount} note(s)</span> : null}
                {isActive ? <span className="badge">ACTIVE</span> : null}
              </div>
              {m.message_title?.trim() ? (
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{m.message_title}</div>
              ) : null}
              <div style={{ fontSize: 12, color: "#0f172a" }}>{snippet(m.content)}</div>
            </div>
          ),
        },
        style: {
          border: `2px solid ${borderColor}`,
          borderRadius: 10,
          padding: 8,
          background,
          width: 240,
        },
      } satisfies Node;
    });

    const edges: Edge[] = messages
      .filter((m) => m.parent_id != null)
      .map((m) => ({
        id: `${m.parent_id}-${m.id}`,
        source: m.parent_id as string,
        target: m.id,
        animated: false,
        style: { stroke: "#94a3b8" },
      }));

    return { nodes, edges };
  }, [messages, notes, active_state.active_message_id, props.selectedMessageId]);

  return (
    <div style={{ height: "100%", minHeight: 260, width: "100%" }}>
      <ReactFlow
        nodes={nodesAndEdges.nodes}
        edges={nodesAndEdges.edges}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        onNodeClick={(_, node) => {
          if (props.noteHostSelectionMode && props.onNoteHostSelect) {
            props.onNoteHostSelect(node.id);
          }
          props.onSelectMessage(node.id);
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

