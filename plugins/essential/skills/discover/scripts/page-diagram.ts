import { RenderError, escapeHtml, requireString } from "./render-page.ts";

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
}

/** every role, in the order the legend lists them. */
const NODE_ROLES = [
  "client",
  "edge",
  "domain",
  "engine",
  "source",
  "derived",
  "ephemeral",
] as const;

/** every edge kind, in the order the legend lists them. */
const EDGE_KINDS = ["flow", "fanout", "derive"] as const;

/**
 * the tag drawn inside each node.
 *
 * This mapping is injective, which is what makes the role recoverable under
 * `filter: grayscale(1)` without reading any other channel.
 */
const ROLE_TAG: Record<NodeRole, string> = {
  client: "CLIENT",
  edge: "EDGE",
  domain: "DOMAIN",
  engine: "ENGINE",
  source: "SOURCE",
  derived: "DERIVED",
  ephemeral: "EPHEMERAL",
};

/** what each role means, for the legend and the text list. */
const ROLE_NOTE: Record<NodeRole, string> = {
  client: "outside the service boundary",
  edge: "stateless boundary",
  domain: "owns business logic",
  engine: "load-bearing computation",
  source: "durable source of truth",
  derived: "rebuildable cache",
  ephemeral: "no durability guarantee",
};

/** what each edge kind means, used whenever an edge declares no label. */
const KIND_NOTE: Record<EdgeKind, string> = {
  flow: "direct path",
  fanout: "fan-out",
  derive: "derived state",
};

/** narrowest a node box may be drawn, in px. */
const NODE_MIN_WIDTH = 176;
/** widest a node box may be drawn, in px, before its label simply wraps. */
const NODE_MAX_WIDTH = 268;
/** horizontal breathing room inside a node box, per side, in px. */
const NODE_PAD_X = 18;
/** slack below the last label line of a node box, in px. */
const NODE_PAD_Y = 18;
/** vertical space the role tag occupies at the top of a node box, in px. */
const TAG_ZONE = 28;
/** distance between label baselines inside a node box, in px. */
const LINE_HEIGHT = 18;
/** average advance of the label face at .9rem, in px. */
const LABEL_ADVANCE = 7.15;
/** advance of the mono edge-label face at .78rem plus its halo, in px. */
const EDGE_ADVANCE = 7.7;
/** characters a label line holds before it wraps. */
const WRAP_LIMIT = 20;
/** lines a node label may occupy before the remainder is run together. */
const MAX_LINES = 3;
/** horizontal space between two nodes of the same layer, in px. */
const COLUMN_GAP = 44;
/** vertical space between two layers, in px. */
const LAYER_GAP = 76;
/** slack between the graph and the edge of the drawing, in px. */
const FRAME_PAD = 18;
/** distance from the content to the first around-routing lane, in px. */
const LANE_INSET = 18;
/** distance between two adjacent around-routing lanes, in px. */
const LANE_GAP = 16;
/** gap between an around-routing lane and its label, in px. */
const LANE_LABEL_GAP = 8;

/** a node once its label is wrapped and its box is placed. */
interface PlacedNode extends DiagramNode {
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
interface PlacedEdge {
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
interface Placement {
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

/** the stylesheet the `diagram` block needs, appended to the page's own. */
export const DIAGRAM_CSS = `
.diagram{display:flex; flex-direction:column; gap:.8rem; margin:0}
.diagram-title{margin:0; font-family:var(--font-display); font-weight:560; font-size:1.15rem; letter-spacing:-.015em}
/* R-8 — the drawing is emitted at its natural pixel size and is never scaled
   to fit, so its type cannot be shrunk below the small-type floor. A narrow
   viewport scrolls this frame instead. */
.diagram-frame{overflow-x:auto; padding:.4rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
.diagram-frame svg{display:block; max-width:none}

.dg-tag{font:650 .75rem/1 var(--font-mono); letter-spacing:.1em; fill:var(--ui-faint)}
.dg-label{font:560 .9rem/1 var(--font-body); fill:var(--ui-ink)}
/* the halo is painted under the glyphs, so a label stays readable wherever it
   crosses a line it does not belong to */
.dg-edge-label{font:.78rem/1 var(--font-mono); fill:var(--ui-muted); paint-order:stroke; stroke:var(--ui-raised); stroke-width:3px; stroke-linejoin:round}

/* SC-6 — role reaches the reader as tag, then stroke pattern, then stroke
   weight, and only then colour. The tag alone is injective. */
.dg-box{fill:var(--ui-canvas); stroke:var(--ui-border-strong); stroke-width:1.5}
.dg-node-client .dg-box{stroke:var(--ui-faint); stroke-dasharray:5 4}
.dg-node-edge .dg-box{stroke:var(--ui-accent); stroke-dasharray:5 4}
.dg-node-domain .dg-box{stroke:var(--ui-border-strong)}
.dg-node-engine .dg-box{stroke:var(--ui-accent); stroke-width:2.75}
.dg-node-source .dg-box{stroke:var(--ui-positive); stroke-width:2}
.dg-node-derived .dg-box{stroke:var(--ui-positive); stroke-width:1}
.dg-node-ephemeral .dg-box{stroke:var(--ui-amber); stroke-dasharray:1.5 3.5}
.dg-box-inner{fill:none; stroke:var(--ui-positive); stroke-width:1}
.dg-node:focus{outline:none}
.dg-node:focus-visible{outline:3px solid var(--ui-focus); outline-offset:3px}
.dg-node:focus-visible .dg-box{stroke:var(--ui-focus); stroke-width:3; stroke-dasharray:none}

.dg-edge{fill:none; stroke-width:1.9}
.dg-edge-flow{stroke:var(--ui-accent)}
.dg-edge-fanout{stroke:var(--ui-amber); stroke-dasharray:5 4}
.dg-edge-derive{stroke:var(--ui-positive); stroke-dasharray:2 3}
/* last, so a long-range edge reads as long-range whatever it carries; its
   arrowhead still says which kind it is */
.dg-edge-around{stroke-dasharray:9 5}
.dg-head-flow{fill:var(--ui-accent)}
.dg-head-fanout{fill:none; stroke:var(--ui-amber); stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}
.dg-head-derive{fill:var(--ui-positive)}

.diagram-legend{display:flex; flex-wrap:wrap; gap:.5rem 1.35rem; color:var(--ui-muted); font-size:.82rem}
.dg-key{display:inline-flex; gap:.5rem; align-items:center}
.dg-key-tag{padding:.12rem .42rem; border:1px solid var(--ui-border-strong); border-radius:.35rem; color:var(--ui-ink); font:650 .75rem/1.35 var(--font-mono); letter-spacing:.1em}
.dg-key-line{width:1.5rem; border-top:2px solid}
.dg-key-flow{color:var(--ui-accent)}
.dg-key-fanout{color:var(--ui-amber); border-top-style:dashed}
.dg-key-derive{color:var(--ui-positive); border-top-style:dotted}
.dg-key-around{color:var(--ui-muted); border-top-style:dashed}
`;

/**
 * reads a layer band, refusing anything that is not a non-negative integer
 * @param value the author-supplied layer
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the layer as a number
 */
function requireLayer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new RenderError(
      `${path}: required non-negative integer, received ${JSON.stringify(value)}`,
    );
  return value;
}

/**
 * reads a value that must be one of a fixed set of tokens
 * @param value the author-supplied token, or `undefined` for the fallback
 * @param allowed every accepted token, in the order the refusal lists them
 * @param fallback the token used when the author supplied none
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the matched token
 */
function requireToken<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
): T {
  if (value === undefined) return fallback;
  const matched = allowed.find((option) => option === value);
  if (matched === undefined)
    throw new RenderError(
      `${path}: required one of ${allowed.map((option) => JSON.stringify(option)).join(", ")}, received ${JSON.stringify(value)}`,
    );
  return matched;
}

/**
 * reads an array, refusing a value of any other shape
 * @param value the author-supplied collection
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the same value, typed as an array of unknown members
 */
function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new RenderError(
      `${path}: required non-empty array, received ${JSON.stringify(value)}`,
    );
  return value;
}

/**
 * breaks a label into the lines drawn inside a node box
 * @param label the node's full label
 * @returns up to `MAX_LINES` lines, the last absorbing any remainder
 */
function wrapLabel(label: string): string[] {
  const lines = label
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((wrapped, word) => {
      const last = wrapped.at(-1);
      if (last === undefined || `${last} ${word}`.length > WRAP_LIMIT)
        return [...wrapped, word];
      return [...wrapped.slice(0, -1), `${last} ${word}`];
    }, []);
  if (lines.length <= MAX_LINES) return lines;
  return [
    ...lines.slice(0, MAX_LINES - 1),
    lines.slice(MAX_LINES - 1).join(" "),
  ];
}

/**
 * validates every declared node and wraps its label
 * @param nodes the author-supplied node list
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns each node with its role resolved and its label wrapped, unplaced
 */
function readNodes(nodes: unknown, path: string): PlacedNode[] {
  return requireArray(nodes, `${path}.nodes`).reduce<PlacedNode[]>(
    (read, entry, index) => {
      const at = `${path}.nodes[${index}]`;
      const node = entry as DiagramNode;
      const id = requireString(node.id, `${at}.id`);
      if (read.some((seen) => seen.id === id))
        throw new RenderError(
          `${at}.id: required a node id declared once, received ${JSON.stringify(id)} for a second time`,
        );
      const label = requireString(node.label, `${at}.label`);
      return [
        ...read,
        {
          id,
          label,
          layer: requireLayer(node.layer, `${at}.layer`),
          role: requireToken(node.role, NODE_ROLES, "domain", `${at}.role`),
          // every declared field is read explicitly, so an unusable `note`
          // refuses by path instead of being spread through unchecked and
          // then silently dropped by the truthiness tests that read it
          ...(node.note === undefined
            ? {}
            : { note: requireString(node.note, `${at}.note`) }),
          lines: wrapLabel(label),
          x: 0,
          y: 0,
        },
      ];
    },
    [],
  );
}

/**
 * resolves both ends of every declared edge against the declared nodes
 * @param edges the author-supplied edge list
 * @param nodes every node already validated by `readNodes`
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns each edge with its ends and kind resolved, unrouted
 */
function readEdges(
  edges: unknown,
  nodes: PlacedNode[],
  path: string,
): Omit<PlacedEdge, "around" | "points" | "caption">[] {
  return requireArray(edges, `${path}.edges`).map((entry, index) => {
    const at = `${path}.edges[${index}]`;
    const edge = entry as DiagramEdge;
    const ends = (["from", "to"] as const).map((end) => {
      const id = requireString(edge[end], `${at}.${end}`);
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node)
        throw new RenderError(
          `${at}.${end}: required the id of a declared node, received ${JSON.stringify(id)} which no node declares`,
        );
      return node;
    });
    const [from, to] = ends;
    if (from.id === to.id)
      throw new RenderError(
        `${at}: required two different nodes, received ${JSON.stringify(from.id)} at both ends`,
      );
    // the router draws adjacent layers and long-range layers, and nothing
    // else; an edge inside one layer has no supported shape, so it is refused
    // rather than drawn wrongly
    if (from.layer === to.layer)
      throw new RenderError(
        `${at}: required two nodes in different layers, received ${JSON.stringify(from.id)} and ${JSON.stringify(to.id)} both in layer ${from.layer}`,
      );
    return {
      from,
      to,
      kind: requireToken(edge.kind, EDGE_KINDS, "flow", `${at}.kind`),
      ...(edge.label === undefined
        ? {}
        : { label: requireString(edge.label, `${at}.label`) }),
    };
  });
}

/**
 * measures and places every node and routes every edge.
 *
 * `x` comes from the node's index within its layer and `y` from the layer
 * itself. There is no layout engine, no force simulation, and no crossing
 * minimisation; the drawing is a pure function of the declared layers.
 * @param block the validated diagram block
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns the measured drawing, at its natural size
 */
function place(block: DiagramBlock, path: string): Placement {
  const nodes = readNodes(block.nodes, path);
  const resolved = readEdges(block.edges, nodes, path);

  const widest = Math.max(
    ...nodes.flatMap((node) => node.lines.map((line) => line.length)),
  );
  const nodeWidth = Math.min(
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(widest * LABEL_ADVANCE) + 2 * NODE_PAD_X),
  );
  const tallest = Math.max(...nodes.map((node) => node.lines.length));
  const nodeHeight = TAG_ZONE + tallest * LINE_HEIGHT + NODE_PAD_Y;

  const layers = Math.max(...nodes.map((node) => node.layer)) + 1;
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
  const margin = (side: "left" | "right"): number => {
    const used = sides
      .map((seen, index) => ({ seen, index }))
      .filter((entry) => entry.seen === side);
    if (used.length === 0) return FRAME_PAD;
    return (
      LANE_INSET +
      Math.max(
        ...used.map(
          (entry) =>
            lanes[entry.index] * LANE_GAP +
            LANE_LABEL_GAP +
            Math.ceil((resolved[entry.index].label ?? "").length * EDGE_ADVANCE),
        ),
      ) +
      FRAME_PAD
    );
  };
  const left = margin("left");
  const right = margin("right");

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
          },
        }),
  };
}

/**
 * draws one node as a focusable group
 * @param node the placed node
 * @param size the box size every node shares
 * @returns the node's SVG markup
 */
function drawNode(
  node: PlacedNode,
  size: { width: number; height: number },
): string {
  const centre = node.x + size.width / 2;
  const title = node.note ? `${node.label} — ${node.note}` : node.label;
  const inner =
    node.role === "source"
      ? `<rect class="dg-box-inner" x="${node.x + 5}" y="${node.y + 5}" width="${size.width - 10}" height="${size.height - 10}" rx="7" />`
      : "";
  const lines = node.lines
    .map(
      (line, index) =>
        `<text class="dg-label" x="${centre}" y="${node.y + TAG_ZONE + 15 + index * LINE_HEIGHT}" text-anchor="middle">${escapeHtml(line)}</text>`,
    )
    .join("");
  // tabindex makes the node tab-reachable in reading order and the title gives
  // the group its accessible name
  return [
    `<g class="dg-node dg-node-${node.role}" tabindex="0" role="group">`,
    `<title>${escapeHtml(title)}</title>`,
    `<rect class="dg-box" x="${node.x}" y="${node.y}" width="${size.width}" height="${size.height}" rx="10" />`,
    inner,
    `<text class="dg-tag" x="${centre}" y="${node.y + 20}" text-anchor="middle">${escapeHtml(ROLE_TAG[node.role])}</text>`,
    lines,
    `</g>`,
  ].join("");
}

/**
 * draws one edge as a polyline with its kind's arrowhead
 * @param edge the routed edge
 * @param slug the diagram's document-unique marker prefix
 * @returns the edge's SVG markup
 */
function drawEdge(edge: PlacedEdge, slug: string): string {
  const around = edge.around ? " dg-edge-around" : "";
  const line = `<path class="dg-edge dg-edge-${edge.kind}${around}" d="M${edge.points.map(([x, y]) => `${x} ${y}`).join(" L")}" marker-end="url(#${slug}-${edge.kind})" />`;
  if (!edge.caption) return line;
  return `${line}<text class="dg-edge-label" x="${edge.caption.x}" y="${edge.caption.y}" text-anchor="${edge.caption.anchor}"${edge.around ? ' dominant-baseline="middle"' : ""}>${escapeHtml(edge.label ?? "")}</text>`;
}

/**
 * declares one arrowhead per kind actually drawn
 * @param kinds every kind the graph uses
 * @param slug the diagram's document-unique marker prefix
 * @returns the `<defs>` markup
 */
function drawMarkers(kinds: EdgeKind[], slug: string): string {
  const shape: Record<EdgeKind, string> = {
    flow: '<path d="M0.5 1 L9 5 L0.5 9 Z" />',
    fanout: '<path d="M1.2 1.4 L8.4 5 L1.2 8.6" />',
    derive: '<path d="M0.5 5 L4.75 1.4 L9 5 L4.75 8.6 Z" />',
  };
  return `<defs>${kinds
    .map(
      (kind) =>
        `<marker id="${slug}-${kind}" class="dg-head-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">${shape[kind]}</marker>`,
    )
    .join("")}</defs>`;
}

/**
 * writes the whole graph out as text, clipped beside the drawing
 * @param placement the measured drawing
 * @returns the `.sr-only` markup a screen reader reads instead of the SVG
 */
function drawTextList(placement: Placement): string {
  const nodes = placement.nodes
    .map(
      (node) =>
        `<li>${escapeHtml(node.label)} — ${escapeHtml(ROLE_NOTE[node.role])}, layer ${node.layer}${node.note ? `: ${escapeHtml(node.note)}` : ""}</li>`,
    )
    .join("");
  const edges = placement.edges
    .map(
      (edge) =>
        `<li>${escapeHtml(edge.from.label)} -&gt; ${escapeHtml(edge.to.label)}: ${escapeHtml(edge.label ?? KIND_NOTE[edge.kind])}</li>`,
    )
    .join("");
  return `<div class="sr-only"><p>${placement.nodes.length} nodes:</p><ul>${nodes}</ul><p>${placement.edges.length} connections:</p><ul>${edges}</ul></div>`;
}

/**
 * lists only the roles and kinds the graph actually draws
 * @param placement the measured drawing
 * @returns the `<figcaption>` markup
 */
function drawLegend(placement: Placement): string {
  const roles = NODE_ROLES.filter((role) =>
    placement.nodes.some((node) => node.role === role),
  ).map(
    (role) =>
      `<span class="dg-key"><span class="dg-key-tag">${ROLE_TAG[role]}</span>${ROLE_NOTE[role]}</span>`,
  );
  const kinds = EDGE_KINDS.filter((kind) =>
    placement.edges.some((edge) => edge.kind === kind),
  ).map(
    (kind) =>
      `<span class="dg-key"><span class="dg-key-line dg-key-${kind}"></span>${KIND_NOTE[kind]}</span>`,
  );
  const around = placement.edges.some((edge) => edge.around)
    ? [
        '<span class="dg-key"><span class="dg-key-line dg-key-around"></span>skips or reverses a layer</span>',
      ]
    : [];
  return `<figcaption class="diagram-legend">${[...roles, ...kinds, ...around].join("")}</figcaption>`;
}

/**
 * renders a `diagram` block as inline SVG at its natural pixel size.
 *
 * The drawing is never scaled to fit: it carries explicit `width` and `height`
 * and no `viewBox`, so nothing can shrink its type below the small-type floor.
 * A viewport narrower than the graph scrolls the surrounding frame instead.
 * @param block the block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @returns the figure's HTML, including its text alternative and legend
 */
export function renderDiagram(block: DiagramBlock, path: string): string {
  const title = requireString(block.title, `${path}.title`);
  const placement = place(block, path);
  // a trailing separator from `blocks[1]` would leak into every marker id
  const slug = `dg-${path.replaceAll(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  const kinds = EDGE_KINDS.filter((kind) =>
    placement.edges.some((edge) => edge.kind === kind),
  );
  const size = { width: placement.nodeWidth, height: placement.nodeHeight };
  return [
    `<figure class="diagram" aria-labelledby="${slug}-title">`,
    `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>`,
    drawTextList(placement),
    `<div class="diagram-frame">`,
    `<svg width="${placement.width}" height="${placement.height}" role="group" aria-label="${escapeHtml(title)}">`,
    drawMarkers(kinds, slug),
    placement.edges.map((edge) => drawEdge(edge, slug)).join(""),
    placement.nodes.map((node) => drawNode(node, size)).join(""),
    `</svg>`,
    `</div>`,
    drawLegend(placement),
    `</figure>`,
  ].join("");
}
