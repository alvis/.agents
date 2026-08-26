import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireString,
} from "../validate.ts";

import type { Block, Rich } from "../types.ts";

/**
 * draws one side of a choice's trade-off as a labelled, list-like run of spans
 * @param items the author-supplied clauses, or `undefined` when absent
 * @param side the machine key the stylesheet selects on, kept separate from
 *   `heading` so rewording the visible word cannot move the selector
 * @param heading the visible word introducing the side
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the trade-off markup, or `""` when the side is absent
 */
export function renderTradeoff(
  items: unknown,
  side: "pros" | "cons",
  heading: string,
  path: string,
): string {
  if (items === undefined) return "";
  const clauses = requireFilledArray<unknown>(items, path)
    .map(
      (item, index) =>
        `<span class="tradeoff-item">${escapeHtml(requireString(item, `${path}[${index}]`))}</span>`,
    )
    .join("");
  return `<span class="tradeoff" data-tradeoff="${side}"><span class="tradeoff-label">${heading}</span>${clauses}</span>`;
}

/**
 * draws one column of the board-level trade-offs block
 * @param items the author-supplied clauses
 * @param key the machine key the stylesheet selects on, kept separate from
 *   `heading` so rewording the visible words cannot move the selector
 * @param heading the visible words introducing the column
 * @param path JSON path of the value, named verbatim by any refusal
 * @returns the column as HTML
 */
function renderColumn(
  items: unknown,
  key: string,
  heading: string,
  path: string,
): string {
  // an empty column is refused rather than drawn blank: a trade-offs block
  // whose costs read as nothing is a stronger claim than the author made
  const points = requireFilledArray<Rich>(items, path)
    .map((item, index) => `<li>${renderInline(item, `${path}[${index}]`)}</li>`)
    .join("");
  return `<div class="tradeoff-column" data-tradeoff="${key}"><h4>${heading}</h4><ul>${points}</ul></div>`;
}

/**
 * draws what a direction buys, what it costs, and where it stops working
 * @param block the trade-offs block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the trade-offs as HTML
 */
export function renderTradeoffs(
  block: Extract<Block, { type: "tradeoffs" }>,
  path: string,
): string {
  const title = optionalString(block.title, `${path}.title`) ?? "Trade-offs";
  // the three columns are fixed and always drawn together: wins and costs
  // alone read as a balanced case, and it is the third that says when the
  // author would not recommend this at all
  const columns = [
    renderColumn(block.wins, "wins", "What it buys", `${path}.wins`),
    renderColumn(block.costs, "costs", "What it costs", `${path}.costs`),
    renderColumn(
      block.failsWhen,
      "fails",
      "Where it stops working",
      `${path}.failsWhen`,
    ),
  ].join("");
  // .tradeoff-panel, not .tradeoffs: the choice block already owns that name
  // for its inline pros/cons strip, and one stylesheet cannot mean both
  return `<div class="tradeoff-panel"><h3>${escapeHtml(title)}</h3><div class="tradeoff-grid">${columns}</div></div>`;
}
