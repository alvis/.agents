import type { LaneUse, PlacedNode, Placement } from "./shape.ts";

/** narrowest a node box may be drawn, in px. */
export const NODE_MIN_WIDTH = 176;
/** widest a node box may be drawn, in px, before its label simply wraps. */
export const NODE_MAX_WIDTH = 268;
/** horizontal breathing room inside a node box, per side, in px. */
export const NODE_PAD_X = 18;
/** slack below the last label line of a node box, in px. */
export const NODE_PAD_Y = 18;
/** vertical space the role tag occupies at the top of a node box, in px. */
export const TAG_ZONE = 28;
/** distance between label baselines inside a node box, in px. */
export const LINE_HEIGHT = 18;
/** average advance of the label face at .9rem, in px. */
export const LABEL_ADVANCE = 7.15;
/** advance of the mono edge-label face at .78rem plus its halo, in px. */
export const EDGE_ADVANCE = 7.7;
/** characters a label line holds before it wraps. */
export const WRAP_LIMIT = 20;
/** lines a node label may occupy before the remainder is run together. */
export const MAX_LINES = 3;
/** horizontal space between two nodes of the same layer, in px. */
export const COLUMN_GAP = 44;
/** vertical space between two layers, in px. */
export const LAYER_GAP = 76;
/** slack between the graph and the edge of the drawing, in px. */
export const FRAME_PAD = 18;
/** distance from the content to the first around-routing lane, in px. */
export const LANE_INSET = 18;
/** distance between two adjacent around-routing lanes, in px. */
export const LANE_GAP = 16;
/** gap between an around-routing lane and its label, in px. */
export const LANE_LABEL_GAP = 8;
/**
 * half the side of a step badge's square tile, in px.
 *
 * two mono digits at .75rem are 14.4px wide, so a 22px tile holds the largest
 * step with 3.8px of air each side. Centred on a box's corner it reaches 11px
 * past it, which is inside `FRAME_PAD` and clear of the first lane at
 * `LANE_INSET`, so a badge never moves the drawing's size or a pin's place.
 */
export const STEP_HALF = 11;
/** corner radius of a step badge's tile, in px: rounded enough to read as a tag, square enough never to pass for a pin's disc. */
export const STEP_CORNER = 4;
/** highest step number a badge holds, because it has room for two digits. */
export const MAX_STEP = 99;
/**
 * narrowest gap between two columns of an across flow, in px.
 *
 * an edge that bends in a gap does so at its middle, and each half has to
 * hold a 10px arrowhead beside the 18px `LANE_INSET` of clear space: 2 × 28.
 */
export const ACROSS_GAP = 56;
/** clear space each side of an across-flow caption, in px: the 10px arrowhead plus 2px, so a caption never covers a head. */
export const CAPTION_PAD = 12;
/** height of an across-flow caption's baseline above the line it names, in px: the .78rem mono face's descenders reach about 3px, and its 3px halo must clear the line's 1.9px stroke. */
export const CAPTION_RISE = 7;

/**
 * sizes the one box every node of a diagram is drawn at
 * @param nodes every node, its label already wrapped
 * @returns the width and height every box shares, in px
 */
export function measureBox(
  nodes: PlacedNode[],
): Pick<Placement, "nodeWidth" | "nodeHeight"> {
  const widest = Math.max(
    ...nodes.flatMap((node) => node.lines.map((line) => line.length)),
  );
  const tallest = Math.max(...nodes.map((node) => node.lines.length));

  return {
    nodeWidth: Math.min(
      NODE_MAX_WIDTH,
      Math.max(NODE_MIN_WIDTH, Math.ceil(widest * LABEL_ADVANCE) + 2 * NODE_PAD_X),
    ),
    nodeHeight: TAG_ZONE + tallest * LINE_HEIGHT + NODE_PAD_Y,
  };
}

/**
 * measures one side's margin, wide enough for every lane routed down it and
 * that lane's caption
 * @param routed every edge routed down this side, with its lane
 * @returns the margin in px, the frame padding alone when no edge uses the side
 */
export function margin(routed: LaneUse[]): number {
  if (routed.length === 0) return FRAME_PAD;

  return (
    LANE_INSET +
    Math.max(
      ...routed.map(
        ({ lane, label }) => lane * LANE_GAP + LANE_LABEL_GAP + captionWidth(label),
      ),
    ) +
    FRAME_PAD
  );
}

/**
 * measures the width an edge's caption paints
 * @param label what the edge carries, if the author said
 * @returns the caption's width in px, zero for an unlabelled edge
 */
export function captionWidth(label: string | undefined): number {
  return Math.ceil((label ?? "").length * EDGE_ADVANCE);
}

