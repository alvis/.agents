import { escapeHtml } from "../escape.ts";
import { LINE_HEIGHT, TAG_ZONE } from "./geometry.ts";
import { EDGE_KINDS, KIND_NOTE, NODE_ROLES, ROLE_NOTE, ROLE_TAG } from "./vocabulary.ts";

import type { EdgeKind, PlacedEdge, PlacedNode, Placement } from "./shape.ts";

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
    `<g class="dg-node dg-node-${node.role}" tabindex="0" role="group"${node.detail === undefined ? "" : ` data-diagram-node="${escapeHtml(node.id)}"`}>`,
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
export function drawEdge(edge: PlacedEdge, slug: string): string {
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

