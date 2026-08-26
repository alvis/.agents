import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  requireArray,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { MOMENT_STATE_LABEL } from "../vocabulary.ts";

import type { Block, Lane, Moment } from "../types.ts";

/** the states a moment may report. */
const STATES = Object.keys(
  MOMENT_STATE_LABEL,
) as (keyof typeof MOMENT_STATE_LABEL)[];

/**
 * draws a dated or timestamped rail of moments
 * @param block the timeline block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the rail as HTML
 */
export function renderTimeline(
  block: Extract<Block, { type: "timeline" }>,
  path: string,
): string {
  const moments = requireFilledArray<Moment>(block.items, `${path}.items`)
    .map((moment, index) => {
      const at = `${path}.items[${index}]`;
      requireObject<Moment>(moment, at);
      const when = escapeHtml(requireString(moment.when, `${at}.when`));
      const state =
        moment.state === undefined
          ? undefined
          : requireOneOf(moment.state, STATES, `${at}.state`);
      const tags = requireArray<string>(moment.tags ?? [], `${at}.tags`)
        .map(
          (tag, tagIndex) =>
            `<span>${escapeHtml(requireString(tag, `${at}.tags[${tagIndex}]`))}</span>`,
        )
        .join("");
      // the state is a word in the row, not only a dot: a rail read in
      // greyscale otherwise reports every moment as the same moment
      return `<li${state ? ` data-state="${state}"` : ""}><span class="moment-when">${when}</span><span class="moment-title">${renderInline(moment.title, `${at}.title`)}</span>${state ? `<span class="moment-state">${MOMENT_STATE_LABEL[state]}</span>` : ""}${tags ? `<span class="moment-tags">${tags}</span>` : ""}</li>`;
    })
    .join("");
  return `<ol class="timeline">${moments}</ol>`;
}

/**
 * draws lanes whose membership is itself the claim
 * @param block the kanban block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the lanes as HTML
 */
export function renderKanban(
  block: Extract<Block, { type: "kanban" }>,
  path: string,
): string {
  const lanes = requireFilledArray<Lane>(block.lanes, `${path}.lanes`)
    .map((lane, index) => {
      const at = `${path}.lanes[${index}]`;
      requireObject<Lane>(lane, at);
      const label = escapeHtml(requireString(lane.label, `${at}.label`));
      const cards = requireArray(lane.cards, `${at}.cards`)
        .map(
          (card, cardIndex) =>
            `<li class="kanban-card">${renderInline(card, `${at}.cards[${cardIndex}]`)}</li>`,
        )
        .join("");
      // the count is drawn because an empty lane is a claim too — "nothing is
      // parked" reads differently from a lane the reader assumes was cut off
      return `<li class="kanban-lane"><h4>${label} <span class="kanban-count">${requireArray(lane.cards, `${at}.cards`).length}</span></h4><ul class="kanban-cards">${cards}</ul></li>`;
    })
    .join("");
  return `<ul class="kanban">${lanes}</ul>`;
}
