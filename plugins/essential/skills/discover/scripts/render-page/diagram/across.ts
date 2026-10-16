import { RenderError } from "../error.ts";
import {
  ACROSS_GAP,
  CAPTION_PAD,
  CAPTION_RISE,
  COLUMN_GAP,
  FRAME_PAD,
  LANE_GAP,
  LANE_INSET,
  LANE_LABEL_GAP,
  LAYER_GAP,
  captionWidth,
  margin,
  measureBox,
} from "./geometry.ts";

import type {
  LaneUse,
  PlacedEdge,
  PlacedNode,
  Placement,
  ResolvedEdge,
} from "./shape.ts";

/** how an across-flow edge travels between its two boxes. */
type Course = "row" | "drop" | "left" | "right";

/** the measurements every edge of one across flow is routed against. */
interface Frame {
  /** width every node box is drawn at, in px */
  nodeWidth: number;
  /** height every node box is drawn at, in px */
  nodeHeight: number;
  /** left edge of the leftmost column, in px */
  left: number;
  /** right edge of the rightmost column, in px */
  right: number;
  /** top of each row's band, in px, by row */
  tops: number[];
  /** height of each row's band, in px, by row */
  bands: number[];
  /** the row a layer sits in */
  rowOf: (layer: number) => number;
}

/**
 * places a diagram whose layers advance left to right in rows of `wrap`.
 *
 * Layer `l` sits in row ⌊l / wrap⌋ at position `l mod wrap`, drawn left to
 * right on even rows and right to left on odd ones, so the last layer of a
 * row and the first of the next share a column and every turn drops down it.
 * Nodes of one layer stack vertically; a row is as tall as its tallest stack.
 * Only edges into the next layer have a drawn shape; anything longer is
 * refused, because under wrap no axis runs one way and a lane would cross the
 * turns.
 * @param nodes every validated node, its label wrapped, unplaced
 * @param edges every resolved edge, unrouted
 * @param wrap layers per row, at least 2; the layer count for a single row
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns the measured drawing, at its natural size
 */
export function placeAcross(
  nodes: PlacedNode[],
  edges: ResolvedEdge[],
  wrap: number,
  path: string,
): Placement {
  refuseLongRange(edges, path);

  const { nodeWidth, nodeHeight } = measureBox(nodes);
  const layers = Math.max(...nodes.map((node) => node.layer)) + 1;
  const columns = Math.min(wrap, layers);
  const rows = Math.ceil(layers / wrap);
  const rowOf = (layer: number): number => Math.floor(layer / wrap);
  const columnOf = (layer: number): number =>
    rowOf(layer) % 2 === 0 ? layer % wrap : wrap - 1 - (layer % wrap);
  const stacks = [...Array(layers).keys()].map((layer) =>
    nodes.filter((node) => node.layer === layer),
  );
  const tall = (stack: PlacedNode[]): number =>
    stack.length * nodeHeight + Math.max(stack.length - 1, 0) * COLUMN_GAP;
  const bands = [...Array(rows).keys()].map((row) =>
    Math.max(...stacks.slice(row * wrap, (row + 1) * wrap).map(tall)),
  );
  const tops = bands.map(
    (_, row) =>
      FRAME_PAD +
      bands.slice(0, row).reduce((sum, band) => sum + band + LAYER_GAP, 0),
  );
  // each stack is centred in its band, so a row of single boxes is level
  const yOf = (node: PlacedNode): number => {
    const stack = stacks[node.layer];
    const row = rowOf(node.layer);

    return (
      tops[row] +
      Math.round((bands[row] - tall(stack)) / 2) +
      stack.indexOf(node) * (nodeHeight + COLUMN_GAP)
    );
  };

  const courses = edges.map((edge): Course => {
    if (rowOf(edge.from.layer) === rowOf(edge.to.layer)) return "row";
    // a turn drops straight down the shared column only when nothing of
    // either stack stands between its two ends
    if (
      stacks[edge.from.layer].at(-1) === edge.from &&
      stacks[edge.to.layer][0] === edge.to
    )
      return "drop";

    return rowOf(edge.from.layer) % 2 === 0 ? "right" : "left";
  });
  const lanes = courses.map(
    (course, index) =>
      courses.slice(0, index).filter((seen) => seen === course).length,
  );
  const routedDown = (side: "left" | "right"): LaneUse[] =>
    courses.flatMap((course, index) =>
      course === side ? [{ lane: lanes[index], label: edges[index].label }] : [],
    );

  // a gap is wide enough for the widest caption drawn in it: a level edge's
  // caption spans the whole gap, a bent one's only the half nearest its head
  const gaps = [...Array(Math.max(columns - 1, 0)).keys()].map((gap) =>
    Math.max(
      ACROSS_GAP,
      ...edges
        .filter(
          (edge, index) =>
            courses[index] === "row" &&
            Math.min(columnOf(edge.from.layer), columnOf(edge.to.layer)) === gap,
        )
        .map((edge) => {
          const need = captionWidth(edge.label) + 2 * CAPTION_PAD;

          return yOf(edge.from) === yOf(edge.to) ? need : 2 * need;
        }),
    ),
  );
  const left = margin(routedDown("left"));
  const columnX = (column: number): number =>
    left +
    column * nodeWidth +
    gaps.slice(0, column).reduce((sum, gap) => sum + gap, 0);
  const right = columnX(columns - 1) + nodeWidth;

  const placeNode = (node: PlacedNode): PlacedNode => ({
    ...node,
    x: columnX(columnOf(node.layer)),
    y: yOf(node),
  });
  const frame = { nodeWidth, nodeHeight, left, right, tops, bands, rowOf };

  return {
    width: right + margin(routedDown("right")),
    height:
      2 * FRAME_PAD +
      bands.reduce((sum, band) => sum + band, 0) +
      (rows - 1) * LAYER_GAP,
    nodeWidth,
    nodeHeight,
    nodes: stacks.flat().map(placeNode),
    edges: edges.map((edge, index) =>
      route({
        edge: { ...edge, from: placeNode(edge.from), to: placeNode(edge.to) },
        course: courses[index],
        lane: lanes[index],
        frame,
      }),
    ),
  };
}

/**
 * refuses the first edge that does not run into the very next layer
 * @param edges every resolved edge
 * @param path JSON path of the block, used as the prefix of the refusal
 */
function refuseLongRange(edges: ResolvedEdge[], path: string): void {
  const index = edges.findIndex((edge) => edge.to.layer !== edge.from.layer + 1);
  if (index === -1) return;

  const { from, to } = edges[index];
  throw new RenderError(
    `${path}.edges[${index}]: across flow draws only edges between adjacent layers, received ${JSON.stringify(from.id)} (layer ${from.layer}) to ${JSON.stringify(to.id)} (layer ${to.layer}); use "flow": "down", which routes skips and returns round the margin, or a mermaid block`,
  );
}

/**
 * computes the polyline and caption of one across-flow edge
 * @param params the edge with both ends placed, its course and lane, and the frame
 * @returns the routed edge
 */
function route(params: {
  edge: ResolvedEdge;
  course: Course;
  lane: number;
  frame: Frame;
}): PlacedEdge {
  const { edge, course, lane, frame } = params;
  const { from, to } = edge;
  const { nodeWidth, nodeHeight } = frame;
  const fromMiddle = from.y + nodeHeight / 2;
  const toMiddle = to.y + nodeHeight / 2;

  if (course === "row") {
    // each edge leaves the side of its box that faces the way the row reads
    const forward = frame.rowOf(from.layer) % 2 === 0;
    const startX = forward ? from.x + nodeWidth : from.x;
    const endX = forward ? to.x : to.x + nodeWidth;
    const bend = (startX + endX) / 2;
    const level = fromMiddle === toMiddle;

    return {
      ...edge,
      around: false,
      points: level
        ? [
            [startX, fromMiddle],
            [endX, toMiddle],
          ]
        : [
            [startX, fromMiddle],
            [bend, fromMiddle],
            [bend, toMiddle],
            [endX, toMiddle],
          ],
      ...(edge.label === undefined
        ? {}
        : {
            caption: {
              x: level ? bend : (bend + endX) / 2,
              y: toMiddle - CAPTION_RISE,
              anchor: "middle" as const,
            },
          }),
    };
  }

  // a turn's column is the rightmost after an even row and the leftmost after
  // an odd one, so its caption reads inward, across the empty strip between
  // the two rows
  const inward = frame.rowOf(from.layer) % 2 === 0 ? -1 : 1;

  if (course === "drop") {
    const centre = from.x + nodeWidth / 2;
    const row = frame.rowOf(from.layer);

    return {
      ...edge,
      around: false,
      points: [
        [centre, from.y + nodeHeight],
        [centre, to.y],
      ],
      ...(edge.label === undefined
        ? {}
        : {
            caption: {
              x: centre + inward * LANE_LABEL_GAP,
              y: frame.tops[row] + frame.bands[row] + LAYER_GAP / 2,
              anchor: inward < 0 ? ("end" as const) : ("start" as const),
              baseline: "middle" as const,
            },
          }),
    };
  }

  const laneX =
    course === "left"
      ? frame.left - LANE_INSET - lane * LANE_GAP
      : frame.right + LANE_INSET + lane * LANE_GAP;
  const side = course === "left" ? 0 : nodeWidth;

  return {
    ...edge,
    around: false,
    points: [
      [from.x + side, fromMiddle],
      [laneX, fromMiddle],
      [laneX, toMiddle],
      [to.x + side, toMiddle],
    ],
    ...(edge.label === undefined
      ? {}
      : {
          caption: {
            x: laneX - inward * LANE_LABEL_GAP,
            y: (fromMiddle + toMiddle) / 2,
            anchor: inward < 0 ? ("start" as const) : ("end" as const),
            baseline: "middle" as const,
          },
        }),
  };
}
