import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import { optionalString, requireOneOf, requireString } from "../validate.ts";
import { CALLOUT_TONE_LABEL } from "../vocabulary.ts";

import type { Block } from "../types.ts";

/** the stances a callout may take. */
const TONES = Object.keys(
  CALLOUT_TONE_LABEL,
) as (keyof typeof CALLOUT_TONE_LABEL)[];

/**
 * draws an aside, stating its stance as a word beside the heading
 * @param block the callout block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the callout as HTML
 */
export function renderCallout(
  block: Extract<Block, { type: "callout" }>,
  path: string,
): string {
  const title = escapeHtml(requireString(block.title, `${path}.title`));
  const lead = optionalString(block.lead, `${path}.lead`);
  const tone =
    block.tone === undefined
      ? undefined
      : requireOneOf(block.tone, TONES, `${path}.tone`);
  // the tone is announced in words as well as drawn in colour. A callout
  // whose only difference from the one above it is a border hue says nothing
  // to a reader in greyscale, and nothing at all to a screen reader
  const badge = tone
    ? `<span class="callout-tone">${CALLOUT_TONE_LABEL[tone]}</span>`
    : "";
  return `<div class="callout"${tone ? ` data-tone="${tone}"` : ""}><h3>${badge}${title}</h3><p>${lead ? `<strong>${escapeHtml(lead)}</strong> ` : ""}${renderInline(block.text, `${path}.text`)}</p></div>`;
}
