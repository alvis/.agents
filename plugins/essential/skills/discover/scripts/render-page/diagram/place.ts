import { RenderError } from "../error.ts";
import { placeAcross } from "./across.ts";
import {
  COLUMN_GAP,
  FRAME_PAD,
  LANE_GAP,
  LANE_INSET,
  LANE_LABEL_GAP,
  LAYER_GAP,
  margin,
  measureBox,
} from "./geometry.ts";
import { readEdges, readFlow, readNodes } from "./read.ts";

import type {
  DiagramBlock,
  PlacedEdge,
  PlacedNode,
  Placement,
} from "./shape.ts";

/**
 * measures and places every node and routes every edge.
 *
 * In a down flow `x` comes from the node's index within its layer and `y`
 * from the layer itself; an across flow is placed by `placeAcross`. There is
 * no layout engine, no force simulation, and no crossing minimisation; the
 * drawing is a pure function of the declared layers.
 * @param block the validated diagram block
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns the measured drawing, at its natural size
 */
export function place(block: DiagramBlock, path: string): Placement {
  const nodes = readNodes(block.nodes, path);
  const resolved = readEdges(block.edges, nodes, path);
  const { flow, wrap } = readFlow(block, path);
  const layers = Math.max(...nodes.map((node) => node.layer)) + 1;
  // an across flow with no wrap is one row holding every layer
  if (flow === "across")
    return placeAcross(nodes, resolved, wrap ?? layers, path);

  const { nodeWidth, nodeHeight } = measureBox(nodes);
  const perLayer = [...Array(layers).keys()].map((layer) =>
    nodes.filter((node) => node.layer === layer),
  );
  const columns = Math.max(...perLayer.map((layer) => layer.length));
  const content = columns * nodeWidth + (columns - 1) * COLUMN_GAP;

  // an edge is long-range when it skips a layer or runs backwards; forward
  // skips take the right margin and backward runs the left, so the two
  // families never share a lane
  const sides = resolved.map((edge) =>
    edge.to.layer === edge.from.layer + 1
      ? "none"
      : edge.to.layer < edge.from.layer
        ? "left"
        : "right",
  );
  const lanes = sides.map(
    (side, index) => sides.slice(0, index).filter((seen) => seen === side).length,
  );
  const routedDown = (side: "left" | "right"): number =>
    margin(
      sides.flatMap((seen, index) =>
        seen === side ? [{ lane: lanes[index], label: resolved[index].label }] : [],
      ),
    );
  const left = routedDown("left");
  const right = routedDown("right");

  const placed = perLayer.flatMap((layer) => {
    const row = layer.length * nodeWidth + (layer.length - 1) * COLUMN_GAP;
    const start = left + Math.round((content - row) / 2);
    return layer.map((node, index) => ({
      ...node,
      x: start + index * (nodeWidth + COLUMN_GAP),
      y: FRAME_PAD + node.layer * (nodeHeight + LAYER_GAP),
    }));
  });
  const find = (id: string): PlacedNode => {
    const node = placed.find((candidate) => candidate.id === id);
    if (!node) throw new RenderError(`${path}: node ${id} was lost in layout`);
    return node;
  };

  return {
    width: left + content + right,
    height: FRAME_PAD * 2 + layers * nodeHeight + (layers - 1) * LAYER_GAP,
    nodeWidth,
    nodeHeight,
    nodes: placed,
    edges: resolved.map((edge, index) =>
      route({
        edge: { ...edge, from: find(edge.from.id), to: find(edge.to.id) },
        side: sides[index],
        lane: lanes[index],
        geometry: { nodeWidth, nodeHeight, left, content },
      }),
    ),
  };
}

/**
 * computes the three-segment polyline one edge draws
 * @param params the resolved edge, its routing side and lane, and the geometry
 * @returns the edge with its points and caption placed
 */
function route(params: {
  edge: Omit<PlacedEdge, "around" | "points" | "caption">;
  side: string;
  lane: number;
  geometry: {
    nodeWidth: number;
    nodeHeight: number;
    left: number;
    content: number;
  };
}): PlacedEdge {
  const { edge, side, lane, geometry } = params;
  const { nodeWidth, nodeHeight, left, content } = geometry;
  const { from, to } = edge;

  if (side === "none") {
    const startX = from.x + nodeWidth / 2;
    const endX = to.x + nodeWidth / 2;
    const startY = from.y + nodeHeight;
    const middle = startY + LAYER_GAP / 2;
    return {
      ...edge,
      around: false,
      points: [
        [startX, startY],
        [startX, middle],
        [endX, middle],
        [endX, to.y],
      ],
      ...(edge.label === undefined
        ? {}
        : {
            caption:
              startX === endX
                ? { x: startX + 9, y: middle - 5, anchor: "start" as const }
                : {
                    x: (startX + endX) / 2,
                    y: middle - 7,
                    anchor: "middle" as const,
                  },
          }),
    };
  }

  const startY = from.y + nodeHeight / 2;
  const endY = to.y + nodeHeight / 2;
  const laneX =
    side === "left"
      ? left - LANE_INSET - lane * LANE_GAP
      : left + content + LANE_INSET + lane * LANE_GAP;
  const startX = side === "left" ? from.x : from.x + nodeWidth;
  const endX = side === "left" ? to.x : to.x + nodeWidth;
  return {
    ...edge,
    around: true,
    points: [
      [startX, startY],
      [laneX, startY],
      [laneX, endY],
      [endX, endY],
    ],
    ...(edge.label === undefined
      ? {}
      : {
          caption: {
            x:
              side === "left"
                ? laneX - LANE_LABEL_GAP
                : laneX + LANE_LABEL_GAP,
            y: (startY + endY) / 2,
            anchor: side === "left" ? ("end" as const) : ("start" as const),
            baseline: "middle" as const,
          },
        }),
  };
}

