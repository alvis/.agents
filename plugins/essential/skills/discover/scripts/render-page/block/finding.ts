import { escapeHtml } from "../escape.ts";
import { requireFreshId } from "../id.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { SEVERITY_LABEL } from "../vocabulary.ts";

import type { PageIds } from "../id.ts";
import type { Block, Finding } from "../types.ts";

/**
 * draws findings as an ordered list, each led by its severity in words
 * @param block the findings block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param ids every id claimed so far, so a citation anchor stays unique
 * @returns the findings as HTML
 */
export function renderFindings(
  block: Extract<Block, { type: "findings" }>,
  path: string,
  ids: PageIds,
): string {
  const items = requireFilledArray<Finding>(block.items, `${path}.items`);
  const chips = block.filters ? renderChips(items, `${path}.items`) : "";

  return `${chips}<ol class="findings">${items
    .map((item, index) => {
      const at = `${path}.items[${index}]`;
      requireObject<Finding>(item, at);
      const severity = requireOneOf(
        item.severity,
        Object.keys(SEVERITY_LABEL) as (keyof typeof SEVERITY_LABEL)[],
        `${at}.severity`,
      );
      // an id is optional, but once given it is the token a reply cites
      // back, so it has to survive as a fragment and name one finding only
      const id =
        item.id === undefined
          ? undefined
          : requireFreshId(item.id, at, "finding", ids);
      const owner = optionalString(item.owner, `${at}.owner`);
      const evidence = optionalString(item.evidence, `${at}.evidence`);
      const meta = [
        owner ? `<div><dt>Owner</dt><dd>${escapeHtml(owner)}</dd></div>` : "",
        evidence
          ? `<div><dt>Evidence</dt><dd>${escapeHtml(evidence)}</dd></div>`
          : "",
      ].join("");
      // the severity word is visible text, not .sr-only: a card has the room,
      // and reading it is what survives both greyscale and a colour-blind eye
      return `<li class="finding"${id ? ` id="f-${id}"` : ""} data-severity="${severity}" data-filter-item="${severity}"><p class="finding-head">${id ? `<span class="finding-id">${escapeHtml(id)}</span>` : ""}<span class="finding-severity">${SEVERITY_LABEL[severity]}</span><span class="finding-title">${escapeHtml(requireString(item.title, `${at}.title`))}</span></p><p class="finding-text">${escapeHtml(requireString(item.text, `${at}.text`))}</p>${meta ? `<dl class="finding-meta">${meta}</dl>` : ""}</li>`;
    })
    .join("")}</ol>`;
}

/**
 * draws a chip per severity the set actually contains.
 *
 * the count is a property of the data, not of the current selection, so it is
 * computed here once and never moved: a chip that said `3` and then said `0`
 * once something else was chosen would be telling the reader that findings had
 * gone away, when all that happened is that they were dimmed.
 * @param items the findings the chips filter
 * @param path JSON path of `items`, named verbatim by any refusal
 * @returns the chip bar as HTML
 */
function renderChips(items: Finding[], path: string): string {
  const severities = (
    Object.keys(SEVERITY_LABEL) as (keyof typeof SEVERITY_LABEL)[]
  ).filter((severity) =>
    items.some((item, index) => {
      requireObject<Finding>(item, `${path}[${index}]`);

      return item.severity === severity;
    }),
  );
  const chip = (value: string, label: string, count: number): string =>
    `<button type="button" class="chip" data-filter="${value}" aria-pressed="${value === "all" ? "true" : "false"}">${label} <span class="chip-count" data-filter-count>${String(count)}</span></button>`;

  return `<div class="filter-chips" role="group" aria-label="Filter findings by severity" data-filter-chips>${[
    chip("all", "All", items.length),
    ...severities.map((severity) =>
      chip(
        severity,
        SEVERITY_LABEL[severity],
        items.filter((item) => item.severity === severity).length,
      ),
    ),
  ].join("")}</div>`;
}
