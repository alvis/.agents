import { escapeHtml } from "./escape.ts";
import { renderInline } from "./inline.ts";
import {
  drawEdge,
  drawLegend,
  drawMarkers,
  drawNode,
  drawTextList,
} from "./diagram/draw.ts";
import { slugOf } from "./id.ts";
import { pinFrame, renderPins } from "./block/pin.ts";
import { place } from "./diagram/place.ts";
import { EDGE_KINDS } from "./diagram/vocabulary.ts";
import { requireString } from "./validate.ts";

import type { DiagramBlock } from "./diagram/shape.ts";

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
  const slug = slugOf(path, "dg");
  const kinds = EDGE_KINDS.filter((kind) =>
    placement.edges.some((edge) => edge.kind === kind),
  );
  const size = { width: placement.nodeWidth, height: placement.nodeHeight };
  // a template rather than a hidden div, so the detail is inert until the
  // runtime clones it: nothing in it is focusable, findable, or read aloud
  // while it is not the node the reader asked about
  const detailed = block.nodes.filter((node) => node.detail !== undefined);
  const templates = detailed
    .map((node) => {
      const at = `${path}.nodes[${String(block.nodes.indexOf(node))}].detail`;

      return `<template data-diagram-detail="${escapeHtml(node.id)}"><div class="diagram-detail-card"><h4>${escapeHtml(node.label)}</h4><p>${renderInline(node.detail, at)}</p></div></template>`;
    })
    .join("");
  const host = detailed.length
    ? `<aside class="diagram-detail" data-diagram-detail-host aria-live="polite"><p class="diagram-detail-hint">Choose a box to read what it holds.</p></aside>${templates}`
    : "";

  const { layer, cards } = renderPins(block.pins ?? [], `${path}.pins`, slug);

  return [
    `<figure class="diagram" aria-labelledby="${slug}-title">`,
    `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>`,
    drawTextList(placement),
    `<div class="diagram-frame">`,
    // the frame the pins measure against is the drawing itself, inside the
    // scroller rather than around it, so a pin keeps its place on the graph
    // when a narrow viewport scrolls the graph sideways under it
    pinFrame(
      [
        `<svg width="${placement.width}" height="${placement.height}" role="group" aria-label="${escapeHtml(title)}">`,
        drawMarkers(kinds, slug),
        placement.edges.map((edge) => drawEdge(edge, slug)).join(""),
        placement.nodes.map((node) => drawNode(node, size)).join(""),
        `</svg>`,
      ].join(""),
      layer,
    ),
    `</div>`,
    cards,
    host,
    drawLegend(placement),
    `</figure>`,
  ].join("");
}
