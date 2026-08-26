import { escapeHtml } from "../escape.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, ScalePoint } from "../types.ts";

/**
 * draws a rating scale as one labelled radio per point, plus end anchors
 * @param block the scale block
 * @param id the question id the radios share as their group name
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the scale as HTML
 */
export function renderScale(
  block: Extract<Block, { type: "scale" }>,
  id: string,
  path: string,
): string {
  const points = requireFilledArray<ScalePoint>(block.points, `${path}.points`);
  const wordings = points.map((point, index) => {
    const at = `${path}.points[${index}]`;
    requireObject<ScalePoint>(point, at);
    const value = requireString(point.value, `${at}.value`);
    const label = optionalString(point.label, `${at}.label`) ?? value;
    // the ordinal is the information a restyled `choice` would throw away
    return { value, label, answer: `${index + 1} of ${points.length} — ${label}` };
  });
  const segments = wordings
    .map(
      (point, index) =>
        `<label class="scale-point"><input type="radio" name="${escapeHtml(id)}" value="${escapeHtml(point.value)}" data-answer="${escapeHtml(point.answer)}" /><span aria-hidden="true">${index + 1}</span><span class="sr-only">${escapeHtml(point.answer)}</span></label>`,
    )
    .join("");
  const anchors =
    wordings.length > 1
      ? `<p class="scale-anchors"><span>1 — ${escapeHtml(wordings[0].label)}</span><span>${wordings.length} — ${escapeHtml(wordings[wordings.length - 1].label)}</span></p>`
      : "";
  return `<div class="scale">${segments}</div>${anchors}`;
}
