import { escapeHtml } from "./escape.ts";
import { optionalString, requireObject, requireOneOf } from "./validate.ts";
import { PROVENANCE } from "./vocabulary.ts";

import type { Provenance } from "./vocabulary.ts";

/** one claim's standing, once read and checked. */
export interface Standing {
  /** how far the author stands behind the claim */
  level: Provenance;
  /** what the level refers to, when the author named it */
  text?: string;
}

/**
 * reads a provenance claim, refusing a level outside the scale
 * @param value the author-supplied claim
 * @param path JSON path of the value, named verbatim by any refusal
 * @returns the level and its optional subject
 */
export function readProvenance(value: unknown, path: string): Standing {
  const claim = requireObject<{ level: unknown; text?: unknown }>(value, path);
  return {
    level: requireOneOf(claim.level, PROVENANCE, `${path}.level`),
    text: optionalString(claim.text, `${path}.text`),
  };
}

/**
 * draws a provenance claim as a pill carrying its level in words.
 *
 * `data-provenance` is what the runtime collects into the reply, so every
 * pill the page draws is a pill the reply can account for. The level is
 * written out rather than encoded as a colour, because a claim resting on an
 * invented number is exactly the one a greyscale reader must still catch.
 * @param standing the level and its optional subject
 * @param extra classes to add beside `provenance`, for a caller that styles
 *   its own placement without restating the pill's own rules
 * @returns the pill as HTML
 */
export function provenancePill(standing: Standing, extra = ""): string {
  const { level, text } = standing;
  const classes = extra ? `provenance ${extra}` : "provenance";
  const subject = text ? ` ${escapeHtml(text)}` : "";
  return `<span class="${classes}" data-provenance="${level}"><span class="provenance-level">${level}</span>${subject}</span>`;
}
