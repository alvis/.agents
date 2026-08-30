import { openQuestion } from "./question.ts";
import { escapeHtml } from "../escape.ts";
import { RenderError } from "../error.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { PageIds } from "../id.ts";
import type { Block, Observation } from "../types.ts";

/** how many initials a source badge draws before it stops. */
const INITIALS = 2;

/**
 * shortens a source to the letters its badge draws.
 *
 * a badge is a circle roughly two characters wide, so the name is reduced here
 * rather than clipped by the sheet: text cut off by `overflow` is still text a
 * screen reader announces in full and a reader copies in full, and the two
 * would then disagree about what the badge says. The full name is kept beside
 * it as the accessible label instead.
 * @param source who or what noticed the observation
 * @returns the initials, uppercased
 */
function initialsOf(source: string): string {
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS)
    .map((word) => (word[0] ?? "").toUpperCase())
    .join("");
}

/**
 * draws one observation card.
 *
 * the tick is the point of the card and everything above it is the case being
 * made for ticking: what was seen, where, and what it costs. The two labelled
 * lines are a description list rather than paragraphs with bold leads, because
 * `Found in code` and `Impact` are the same two questions of every card and a
 * reader comparing cards reads down one column of them.
 * @param item the observation
 * @param path JSON path of `item`, named verbatim by any refusal
 * @param name the question's id, which every tick in it shares as its name
 * @returns the card's title, which its tick is recorded by, and its markup
 */
function renderCard(
  item: Observation,
  path: string,
  name: string,
): [string, string] {
  requireObject<Observation>(item, path);
  const title = requireString(item.title, `${path}.title`);
  const file = optionalString(item.file, `${path}.file`);
  const source = optionalString(item.source, `${path}.source`);
  const found = renderInline(item.found, `${path}.found`);
  const impact = renderInline(item.impact, `${path}.impact`);
  // the badge is decoration around a name, so the initials are hidden from
  // assistive technology and the name itself is what is announced; a title
  // attribute as well, because a sighted reader cannot expand "SA" either
  const badge = source
    ? `<span class="observation-source" title="${escapeHtml(source)}"><span aria-hidden="true">${escapeHtml(initialsOf(source))}</span><span class="sr-only">Noticed by ${escapeHtml(source)}</span></span>`
    : "";

  const html = [
    `<li class="observation">`,
    `<div class="observation-head"><h4 class="observation-title">${escapeHtml(title)}</h4>${badge}</div>`,
    file ? `<p class="observation-file">${escapeHtml(file)}</p>` : "",
    `<dl class="observation-detail">`,
    `<dt>Found in code</dt><dd>${found}</dd>`,
    `<dt>Impact</dt><dd>${impact}</dd>`,
    `</dl>`,
    // the value is the title rather than the index, so a reply says which
    // observation landed instead of saying that the third one did — and so an
    // answer saved before the author reordered the cards still restores onto
    // the card the reader actually ticked
    `<label class="observation-tick"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(title)}" /><span>This resonates</span></label>`,
    `</li>`,
  ].join("");

  return [title, html];
}

/**
 * draws a set of numbered observation cards the reader ticks where one lands.
 *
 * it opens as a question and saves as a checklist: the shell, the citation
 * code and the answer contract are the ones every other question uses, so a
 * board gains a card format here and nothing new in the store, the status
 * chips, or the reply.
 * @param block the observations block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param ids every name already claimed on this page
 * @returns the question as HTML
 */
export function renderObservations(
  block: Extract<Block, { type: "observations" }>,
  path: string,
  ids: PageIds,
): string {
  const { id, head } = openQuestion(block, path, ids, "fieldset");
  const seen = new Set<string>();
  const cards = requireFilledArray<Observation>(block.items, `${path}.items`)
    .map((item, index) => {
      const at = `${path}.items[${index}]`;
      const [title, card] = renderCard(item, at, id);
      // a tick is recorded by its card's title, so two cards sharing one save
      // as a single value: the reader would tick two boxes, the reply would
      // report one, and restoring would light both
      if (seen.has(title))
        throw new RenderError(
          `${at}.title: duplicate observation ${JSON.stringify(title)}, which a tick is recorded by; give each card its own title`,
        );
      seen.add(title);

      return card;
    })
    .join("");

  return `${head}<ol class="observations">${cards}</ol></fieldset>`;
}
