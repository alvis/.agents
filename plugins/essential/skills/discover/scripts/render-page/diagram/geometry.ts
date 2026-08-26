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

