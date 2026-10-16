import { escapeHtml } from "../escape.ts";
import { syncAttribute } from "../sync.ts";
import { LINE_HEIGHT, STEP_CORNER, STEP_HALF, TAG_ZONE } from "./geometry.ts";
import { EDGE_KINDS, KIND_NOTE, NODE_ROLES, ROLE_NOTE, ROLE_TAG } from "./vocabulary.ts";

import type { EdgeKind, PlacedEdge, PlacedNode, Placement } from "./shape.ts";

/**
 * names a node's place in the sequence, for the title and the text list
 * @param node the placed node
 * @returns the lead-in, or nothing when the node carries no step
 */
function stepLead(node: PlacedNode): string {
  return node.step === undefined ? "" : `Step ${node.step}: `;
}

/**
 * draws a node's step badge on the corner of its box.
 *
 * the badge is a square tile in plain ink, because an author's annotation pin
 * is an accent disc that can sit on the same box: two numbered discs on one
 * node would read as one numbering.
 * @param node the placed node, which carries a step
 * @returns the badge markup, hidden from assistive tech because the title and
 * the text list already say the step in words
 */
function drawStep(node: PlacedNode): string {
  return `<g class="dg-step" aria-hidden="true"><rect x="${node.x - STEP_HALF}" y="${node.y - STEP_HALF}" width="${STEP_HALF * 2}" height="${STEP_HALF * 2}" rx="${STEP_CORNER}" /><text x="${node.x}" y="${node.y}" text-anchor="middle" dominant-baseline="central">${node.step}</text></g>`;
}

/**
 * draws one node as a focusable group
 * @param node the placed node
 * @param size the box size every node shares
 * @returns the node's SVG markup
 */
export function drawNode(
  node: PlacedNode,
  size: { width: number; height: number },
): string {
  const centre = node.x + size.width / 2;
  const title = `${stepLead(node)}${node.note ? `${node.label} — ${node.note}` : node.label}`;
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
    `<g class="dg-node dg-node-${node.role}${node.emphasis ? " is-emphasis" : ""}" tabindex="0" role="group"${node.detail === undefined ? "" : ` data-diagram-node="${escapeHtml(node.id)}"`}${node.tie === undefined ? "" : syncAttribute("tie", node.tie)}>`,
    `<title>${escapeHtml(title)}</title>`,
    `<rect class="dg-box" x="${node.x}" y="${node.y}" width="${size.width}" height="${size.height}" rx="10" />`,
    inner,
    `<text class="dg-tag" x="${centre}" y="${node.y + 20}" text-anchor="middle">${escapeHtml(ROLE_TAG[node.role])}</text>`,
    lines,
    // after the box and its text, so the badge paints over the corner
    node.step === undefined ? "" : drawStep(node),
    `</g>`,
  ].join("");
}

/**
 * draws one edge as a polyline with its kind's arrowhead
 * @param edge the routed edge
 * @param slug the diagram's document-unique marker prefix
 * @returns the edge's SVG markup
 */
export function drawEdge(edge: PlacedEdge, slug: string): string {
  const around = edge.around ? " dg-edge-around" : "";
  const line = `<path class="dg-edge dg-edge-${edge.kind}${around}" d="M${edge.points.map(([x, y]) => `${x} ${y}`).join(" L")}" marker-end="url(#${slug}-${edge.kind})" />`;
  if (!edge.caption) return line;
  return `${line}<text class="dg-edge-label" x="${edge.caption.x}" y="${edge.caption.y}" text-anchor="${edge.caption.anchor}"${edge.caption.baseline === undefined ? "" : ` dominant-baseline="${edge.caption.baseline}"`}>${escapeHtml(edge.label ?? "")}</text>`;
}

/**
 * declares one arrowhead per kind actually drawn
 * @param kinds every kind the graph uses
 * @param slug the diagram's document-unique marker prefix
 * @returns the `<defs>` markup
 */
export function drawMarkers(kinds: EdgeKind[], slug: string): string {
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
export function drawTextList(placement: Placement): string {
  const nodes = placement.nodes
    .map(
      (node) =>
        `<li>${stepLead(node)}${escapeHtml(node.label)} — ${escapeHtml(ROLE_NOTE[node.role])}, layer ${node.layer}${node.note ? `: ${escapeHtml(node.note)}` : ""}</li>`,
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
export function drawLegend(placement: Placement): string {
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

