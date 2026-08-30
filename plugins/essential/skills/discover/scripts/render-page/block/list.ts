import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, Point, Rich } from "../types.ts";

/** what each column of a failure map answers, in the reader's words. */
const STAGE_LABEL = {
  prevent: "Prevent",
  detect: "Detect",
  contain: "Contain",
} as const;

/**
 * draws one bullet, bolding the lead clause ahead of the argument
 * @param point the bullet
 * @param path JSON path of `point`, named verbatim by any refusal
 * @returns the bullet as a list item
 */
function renderPoint(point: Point, path: string): string {
  requireObject<Point>(point, path);
  const lead = optionalString(point.lead, `${path}.lead`);
  const text = renderInline(point.text, `${path}.text`);
  // <strong> rather than a class: the lead is the claim the bullet makes, so
  // the emphasis is the meaning and not a look the sheet happens to give it
  return `<li>${lead ? `<strong>${escapeHtml(lead)}</strong> ` : ""}${text}</li>`;
}

/**
 * draws a bulleted or numbered list
 * @param block the list block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the list as HTML
 */
export function renderList(
  block: Extract<Block, { type: "list" }>,
  path: string,
): string {
  const items = requireFilledArray<Point>(block.items, `${path}.items`)
    .map((point, index) => renderPoint(point, `${path}.items[${index}]`))
    .join("");
  // an ordered list is a different element, not a different bullet glyph: the
  // numbering is what a reader cites back, so it has to survive copy and paste
  const tag = block.ordered === true ? "ol" : "ul";
  return `<${tag} class="list">${items}</${tag}>`;
}

/**
 * draws the executive summary that leads a page
 * @param block the tl;dr block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the summary as HTML
 */
export function renderTldr(
  block: Extract<Block, { type: "tldr" }>,
  path: string,
): string {
  const title = optionalString(block.title, `${path}.title`) ?? "In short";
  const points = requireFilledArray<Point>(block.points, `${path}.points`)
    .map((point, index) => renderPoint(point, `${path}.points[${index}]`))
    .join("");
  return `<aside class="tldr"><h3>${escapeHtml(title)}</h3><ul>${points}</ul></aside>`;
}

/**
 * draws a failure split into what prevents, detects and contains it
 * @param block the failure-map block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the map as HTML
 */
export function renderFailureMap(
  block: Extract<Block, { type: "failure-map" }>,
  path: string,
): string {
  const failure = requireString(block.failure, `${path}.failure`);
  // the three columns are fixed and each one must be answered. A map missing
  // its detection column reads as "nothing detects this", which is a claim the
  // author did not make — so it is refused rather than drawn empty
  const columns = (["prevent", "detect", "contain"] as const)
    .map((stage) => {
      const at = `${path}.${stage}`;
      const entries = requireFilledArray<Rich>(block[stage], at)
        .map((entry, index) => `<li>${renderInline(entry, `${at}[${index}]`)}</li>`)
        .join("");
      return `<div class="failure-stage" data-stage="${stage}"><h4>${STAGE_LABEL[stage]}</h4><ul>${entries}</ul></div>`;
    })
    .join("");
  return `<div class="failure-map"><p class="failure-head">${escapeHtml(failure)}</p><div class="failure-stages">${columns}</div></div>`;
}
