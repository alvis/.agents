import type { Pin } from "../types/content.ts";
import type { Rich } from "../types/inline.ts";

/**
 * how a node participates in the system.
 *
 * SC-6 — the role reaches the reader through four channels, colour last: the
 * uppercase tag drawn inside the node (the only channel that is injective, so
 * the role survives greyscale on its own), the box's stroke pattern, its
 * stroke weight, and only then its hue.
 */
export type NodeRole =
  | "client"
  | "edge"
  | "domain"
  | "engine"
  | "source"
  | "derived"
  | "ephemeral";

/** what an edge carries from one node to the next. */
export type EdgeKind = "flow" | "fanout" | "derive";

/** one box in the graph, placed entirely by the layer the author declares. */
export interface DiagramNode {
  /** unique handle the edges refer to */
  id: string;
  /** the name drawn inside the box, wrapped across lines as needed */
  label: string;
  /** non-negative integer band; `y` is derived from it and nothing else */
  layer: number;
  /** what the node is, drawn as a tag inside the box; defaults to `domain` */
  role?: NodeRole;
  /** one clause on what the node owns, read by the title and the text list */
  note?: string;
  /**
   * what the node holds, shown beside the graph when the node is chosen.
   *
   * a box has room for a name and a tag and nothing more, so a graph that has
   * to explain itself grows a paragraph per node that nobody reads. This puts
   * that paragraph one click away instead, in one place, for whichever node the
   * reader is actually asking about.
   */
  detail?: Rich;
}

/** one directed connection between two declared nodes. */
export interface DiagramEdge {
  /** `id` of the node the edge leaves */
  from: string;
  /** `id` of the node the edge enters */
  to: string;
  /** what crosses the edge, drawn beside the line */
  label?: string;
  /** the kind of traffic, drawn as pattern and arrowhead; defaults to `flow` */
  kind?: EdgeKind;
}

/** a node-and-edge graph drawn as inline SVG at natural size. */
export interface DiagramBlock {
  /** discriminant of the block union */
  type: "diagram";
  /** the figure's heading */
  title: string;
  /** every box in the graph; at least one is required */
  nodes: DiagramNode[];
  /** every connection; each end must name a declared node */
  edges: DiagramEdge[];
  /**
   * the author's numbered pins, placed against the drawing.
   *
   * a node's `detail` explains one box; a pin explains a place — a junction, a
   * boundary, a gap between two boxes that no single node owns. The two are
   * not alternatives, and a graph that only had the first would have nowhere
   * to say why the seam between two of its boxes is the interesting part.
   */
  pins?: Pin[];
}


/** a node once its label is wrapped and its box is placed. */
export interface PlacedNode extends DiagramNode {
  /** the resolved role, with the default applied */
  role: NodeRole;
  /** the label broken into drawn lines */
  lines: string[];
  /** left edge of the box, in px */
  x: number;
  /** top edge of the box, in px */
  y: number;
}

/** an edge once both ends resolve and its polyline is computed. */
export interface PlacedEdge {
  /** the node the edge leaves */
  from: PlacedNode;
  /** the node the edge enters */
  to: PlacedNode;
  /** the resolved kind, with the default applied */
  kind: EdgeKind;
  /** what crosses the edge, if the author said */
  label?: string;
  /** true when the edge skips or reverses layers and routes round the margin */
  around: boolean;
  /** the polyline the edge draws, as `x y` pairs */
  points: number[][];
  /** where the edge's label sits, absent when the edge carries none */
  caption?: { x: number; y: number; anchor: "start" | "middle" | "end" };
}

/** the whole graph, measured and placed. */
export interface Placement {
  /** natural width of the drawing, in px */
  width: number;
  /** natural height of the drawing, in px */
  height: number;
  /** width every node box is drawn at, in px */
  nodeWidth: number;
  /** height every node box is drawn at, in px */
  nodeHeight: number;
  /** every node, in declaration order */
  nodes: PlacedNode[];
  /** every edge, in declaration order */
  edges: PlacedEdge[];
}
