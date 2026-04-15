import { useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";

// ─── back-edge custom component ──────────────────────────────────────────────

function BackEdge({ id, sourceX, sourceY, targetX, targetY, label, style, markerEnd }) {
  // Vòng ra bên phải: control points đẩy ra ngoài theo trục X
  const bulge = Math.max(120, Math.abs(sourceY - targetY) * 0.6);
  const path = `M ${sourceX} ${sourceY} C ${sourceX + bulge} ${sourceY}, ${targetX + bulge} ${targetY}, ${targetX} ${targetY}`;
  const labelX = sourceX + bulge * 0.9;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <span
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10,
            fontWeight: 600,
            color: style?.stroke ?? "#d97706",
            background: "rgba(255,255,255,0.85)",
            padding: "1px 4px",
            borderRadius: 4,
            pointerEvents: "none",
          }}
          className="nodrag nopan"
        >
          {label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { backEdge: BackEdge };

// ─── layout ──────────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 44;
const H_GAP = 60;  // horizontal gap between siblings
const V_GAP = 80;  // vertical gap between levels

/**
 * Build a tree layout from dialogueNodes.
 * Returns { x, y } position keyed by node id.
 */
function buildTreeLayout(dialogueNodes) {
  if (!dialogueNodes.length) return {};

  // Build child map: parentId → [{ childId, edgeLabel }]
  const childMap = {};
  const hasParent = new Set();

  for (const node of dialogueNodes) {
    childMap[node.id] = childMap[node.id] || [];
    const addChild = (childId, label) => {
      if (!childId) return;
      childMap[node.id].push({ childId, label });
      hasParent.add(childId);
    };
    if (node.responses) {
      addChild(node.responses.onSuccess, "onSuccess");
      addChild(node.responses.onFail, "onFail");
      addChild(node.responses.onTimeout, "onTimeout");
      addChild(node.responses.onExhausted, "onExhausted");
    } else {
      addChild(node.next, "next");
    }
  }

  const allIds = new Set(dialogueNodes.map((n) => n.id));
  const roots = dialogueNodes
    .map((n) => n.id)
    .filter((id) => !hasParent.has(id));

  // Assign depth (BFS from roots)
  const depth = {};
  const queue = [...roots];
  for (const id of queue) depth[id] = depth[id] ?? 0;
  while (queue.length) {
    const id = queue.shift();
    for (const { childId } of childMap[id] || []) {
      if (!allIds.has(childId)) continue;
      if (depth[childId] === undefined) {
        depth[childId] = depth[id] + 1;
        queue.push(childId);
      }
    }
  }
  // Orphans (cycles or truly disconnected) get depth 0
  for (const id of allIds) {
    if (depth[id] === undefined) depth[id] = 0;
  }

  // Group by depth
  const byDepth = {};
  for (const id of allIds) {
    const d = depth[id];
    byDepth[d] = byDepth[d] || [];
    byDepth[d].push(id);
  }

  // Assign positions: depth → y, index-in-depth → x
  const pos = {};
  for (const [d, ids] of Object.entries(byDepth)) {
    const totalW = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    const startX = -totalW / 2;
    ids.forEach((id, i) => {
      pos[id] = {
        x: startX + i * (NODE_W + H_GAP),
        y: Number(d) * (NODE_H + V_GAP),
      };
    });
  }

  return { pos, depth };
}

// ─── FitView on mount ────────────────────────────────────────────────────────

function FitViewOnMount() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);
  return null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildFlow(dialogueNodes, selectedNodeId, positions, nodeDepth) {
  const idSet = new Set(dialogueNodes.map((n) => n.id));

  const flowNodes = dialogueNodes.map((node) => ({
    id: node.id,
    data: {
      label: `${node.id} (${node.responses ? "interaction" : "dialogue"})`,
    },
    position: positions[node.id] ?? { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style:
      selectedNodeId === node.id
        ? { border: "2px solid #11698e", borderRadius: 8, padding: "6px 10px", fontSize: 12, width: NODE_W, background: "#e8f4f8" }
        : { border: "1px solid #c5d1dc", borderRadius: 8, padding: "6px 10px", fontSize: 12, width: NODE_W },
  }));

  const edges = [];
  const push = (fromId, toId, label) => {
    if (!toId || !idSet.has(toId)) return;
    // back-edge: target depth <= source depth (cycle / jump backward)
    const isBack = (nodeDepth[toId] ?? 0) <= (nodeDepth[fromId] ?? 0);
    const forwardColor = label === "next" ? "#11698e" : "#7a5ea6";
    const color = isBack ? "#d97706" : forwardColor;
    edges.push({
      id: `${fromId}__${label}__${toId}`,
      source: fromId,
      target: toId,
      label,
      type: isBack ? "backEdge" : "smoothstep",
      animated: isBack,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { strokeWidth: isBack ? 2 : 1.4, stroke: color, strokeDasharray: isBack ? "5 3" : undefined },
      labelStyle: { fontSize: 10, fill: color, fontWeight: isBack ? 600 : 400 },
      updatable: true,
    });
  };

  for (const node of dialogueNodes) {
    if (node.responses) {
      push(node.id, node.responses.onSuccess, "onSuccess");
      push(node.id, node.responses.onFail, "onFail");
      push(node.id, node.responses.onTimeout, "onTimeout");
      push(node.id, node.responses.onExhausted, "onExhausted");
    } else {
      push(node.id, node.next, "next");
    }
  }

  return { flowNodes, edges };
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GraphCanvas({ dialogueNodes, selectedNodeId, onNodeClick, onEdgeUpdate }) {
  const { pos: positions, depth: nodeDepth } = useMemo(() => buildTreeLayout(dialogueNodes), [dialogueNodes]);
  const { flowNodes, edges: baseEdges } = useMemo(
    () => buildFlow(dialogueNodes, selectedNodeId, positions, nodeDepth),
    [dialogueNodes, selectedNodeId, positions, nodeDepth],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // Sync when props change
  useEffect(() => { setNodes(flowNodes); }, [flowNodes, setNodes]);
  useEffect(() => { setEdges(baseEdges); }, [baseEdges, setEdges]);

  /**
   * Called when user finishes dragging an edge handle to a new target.
   * oldEdge.id format: "sourceId__label__oldTargetId"
   */
  const handleEdgeUpdate = useCallback(
    (oldEdge, newConnection) => {
      const parts = oldEdge.id.split("__");
      const label = parts[1]; // "next" | "onSuccess" | ...
      onEdgeUpdate(oldEdge.source, label, newConnection.target);
    },
    [onEdgeUpdate],
  );

  /**
   * Called when user drags an edge end and drops it onto empty space — treat as delete.
   */
  const handleEdgeUpdateEnd = useCallback(
    (_, edge, handleType) => {
      if (handleType === "target") return; // only care about source drags
      // if the edge is still present in the edges array, it was successfully reconnected
      // if not, it means the user dropped on empty → clear the field
      setEdges((eds) => {
        const stillExists = eds.some((e) => e.id === edge.id);
        if (!stillExists) {
          const parts = edge.id.split("__");
          const label = parts[1];
          onEdgeUpdate(edge.source, label, "");
        }
        return eds;
      });
    },
    [onEdgeUpdate, setEdges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onEdgeUpdate={handleEdgeUpdate}
      onEdgeUpdateEnd={handleEdgeUpdateEnd}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      minZoom={0.3}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e2e8f0" gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(n) => (n.id === selectedNodeId ? "#11698e" : "#c5d1dc")}
        maskColor="rgba(255,255,255,0.6)"
      />
      <FitViewOnMount />
    </ReactFlow>
  );
}
