import { escapeHtml } from "../escape.ts";
import {
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { STEP_STATE_LABEL } from "../vocabulary.ts";

import type { Block, Step } from "../types.ts";

/**
 * draws a sequence of steps as an ordered list, each carrying its progress
 * @param block the steps block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the sequence as HTML
 */
export function renderSteps(
  block: Extract<Block, { type: "steps" }>,
  path: string,
): string {
  return `<ol class="steps">${requireFilledArray<Step>(block.items, `${path}.items`)
    .map((item, index) => {
      const at = `${path}.items[${index}]`;
      requireObject<Step>(item, at);
      const title = escapeHtml(requireString(item.title, `${at}.title`));
      const text = escapeHtml(requireString(item.text, `${at}.text`));
      if (item.state === undefined)
        return `<li class="step"><span class="step-marker" aria-hidden="true"></span><div><p class="step-head"><strong class="step-title">${title}</strong></p><p>${text}</p></div></li>`;
      const state = requireOneOf(
        item.state,
        Object.keys(STEP_STATE_LABEL) as (keyof typeof STEP_STATE_LABEL)[],
        `${at}.state`,
      );
      return `<li class="step" data-step-state="${state}"><span class="step-marker" aria-hidden="true"></span><div><p class="step-head"><strong class="step-title">${title}</strong><span class="step-state">${STEP_STATE_LABEL[state]}</span></p><p>${text}</p></div></li>`;
    })
    .join("")}</ol>`;
}
