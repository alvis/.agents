import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, Deviation } from "../types.ts";

/**
 * the two halves of the comparison, and the word each one is drawn under.
 *
 * kept together because the pair is the block: a departure is only legible as
 * the difference between two accounts of the same thing, and naming one of
 * them without the other leaves a reader with an assertion instead.
 */
const SIDES: [keyof Deviation, string][] = [
  ["planned", "The plan said"],
  ["found", "The code revealed"],
];

/**
 * draws one departure from the plan.
 *
 * the two accounts sit side by side and the choice sits under both, because
 * the choice is what the reader is being asked to agree with and it only means
 * anything against the discrepancy above it. `revisit` is last and optional: a
 * departure nobody would reopen should say nothing there rather than say so.
 * @param item the departure
 * @param path JSON path of `item`, named verbatim by any refusal
 * @returns the entry as HTML
 */
function renderEntry(item: Deviation, path: string): string {
  requireObject<Deviation>(item, path);
  const title = requireString(item.title, `${path}.title`);
  const sides = SIDES.map(
    ([field, label]) =>
      `<div class="deviation-side" data-side="${field}"><p class="deviation-label">${label}</p><div class="deviation-body">${renderInline(item[field], `${path}.${field}`)}</div></div>`,
  ).join("");
  // the choice is a definition list rather than another column: it answers a
  // different question from the two above it, and drawing it as a third column
  // would invite the reader to compare it against them
  const revisit =
    item.revisit === undefined
      ? ""
      : `<dt>Worth revisiting when</dt><dd>${renderInline(item.revisit, `${path}.revisit`)}</dd>`;

  return [
    `<li class="deviation">`,
    `<h4 class="deviation-title">${escapeHtml(title)}</h4>`,
    `<div class="deviation-pair">${sides}</div>`,
    `<dl class="deviation-outcome">`,
    `<dt>Chose</dt><dd>${renderInline(item.chose, `${path}.chose`)}</dd>`,
    revisit,
    `</dl>`,
    `</li>`,
  ].join("");
}

/**
 * draws where the build departed from the plan, one entry per departure.
 *
 * a numbered list, because the count is part of what the block reports: a
 * change with one departure and a change with nine are different changes to
 * merge, and a reader should see which they are holding before reading any of
 * them.
 * @param block the deviations block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the block as HTML
 */
export function renderDeviations(
  block: Extract<Block, { type: "deviations" }>,
  path: string,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const entries = requireFilledArray<Deviation>(block.items, `${path}.items`)
    .map((item, index) => renderEntry(item, `${path}.items[${index}]`))
    .join("");

  return `${title ? `<h3 class="deviation-heading">${escapeHtml(title)}</h3>` : ""}<ol class="deviations">${entries}</ol>`;
}
