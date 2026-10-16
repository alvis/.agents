import { renderBlock } from "./block.ts";
import { escapeHtml } from "./escape.ts";
import { requireFreshId } from "./id.ts";
import { renderInline } from "./inline.ts";
import { asksIn, opensWithQuestions } from "./reply.ts";
import { STATE_WORD } from "./runtime/outline.ts";
import {
  optionalString,
  requireArray,
  requireObject,
  requireString,
} from "./validate.ts";

import type { PageContext } from "./context.ts";
import type { Ask } from "./reply.ts";
import type { Block, Section } from "./types.ts";

/**
 * draws one section, numbering it and drawing every block it holds
 * @param section the section to draw
 * @param index the section's zero-based position, which sets its number
 * @param page what the section is rendered into: claimed ids, and the files
 *   the CLI layer already read
 * @returns the section as HTML
 */
export function renderSection(section: Section, index: number, page: PageContext): string {
  const at = `sections[${index}]`;
  requireObject<Section>(section, at);
  const number = String(index + 1).padStart(2, "0");
  const id = requireFreshId(section.id, at, "section", page.ids);
  const eyebrow = optionalString(section.eyebrow, `${at}.eyebrow`);
  const label = escapeHtml(requireString(section.label, `${at}.label`));
  const title = escapeHtml(requireString(section.title, `${at}.title`));
  const body = requireArray<Block>(section.blocks, `${at}.blocks`)
    .map((block, position) =>
      renderBlock(block, `${at}.blocks[${position}]`, page),
    )
    .join("");
  const lede =
    section.lede === undefined
      ? ""
      : `<p class="section-lede">${renderInline(section.lede, `${at}.lede`)}</p>`;
  // read after the body is drawn, so every question the chips name has been
  // through its own refusals and has an id, a ref and a label worth linking to.
  // chips under a title that is followed directly by its cards repeat what is
  // already on screen, so a section opening with all its questions draws none
  const asks = opensWithQuestions(section.blocks, `${at}.blocks`)
    ? ""
    : renderAsks(asksIn(section.blocks, `${at}.blocks`));

  return `<section class="section" id="s-${escapeHtml(id)}" data-section data-section-id="${escapeHtml(id)}" data-section-label="${label}" data-section-title="${title}"><div class="section-heading"><p class="section-no">${number}${eyebrow ? ` · ${escapeHtml(eyebrow)}` : ""}</p><h2>${title}</h2>${noteControl(label)}</div>${lede}${asks}<div class="section-body" data-section-body>${body}</div><ul class="note-list" data-note-list aria-label="Notes on ${label}"></ul></section>`;
}

/**
 * draws the questions a section asks as chips under its heading.
 *
 * a reader who skims the headings learns what is being asked of them and how
 * far along it is without reading a block. Each chip is a plain link to its
 * card, and its state word is text so the state never rests on colour; the
 * runtime repaints both as the reader answers, from the same lines that paint
 * the drawer.
 * @param asks the section's questions in reading order, nested ones included
 * @returns the chips as HTML, or nothing for a section that asks nothing
 */
function renderAsks(asks: Ask[]): string {
  if (!asks.length) return "";

  const chips = asks
    .map(({ question, disposition }) => {
      const id = escapeHtml(question.id);
      const ref = escapeHtml(question.ref);

      return `<a class="q-chip" href="#qs-${id}" data-heading-chip="${id}" data-status="${disposition}" title="${ref} · ${escapeHtml(question.label)}">${ref} <span class="q-chip-state">${STATE_WORD[disposition]}</span></a>`;
    })
    .join("");

  return `<p class="section-asks"><span class="section-asks-label">Asks</span>${chips}</p>`;
}

/**
 * draws the control that adds a note to a section.
 *
 * it ships in the markup rather than being built by the runtime, so a board
 * read with scripting off still shows that notes are a thing this page does,
 * and the control is in the tab order at first paint rather than after boot.
 * @param label the section's label, which names the control
 * @returns the control as HTML
 */
function noteControl(label: string): string {
  return `<button type="button" class="note-add" data-note-add title="Note this section, or the passage you have selected"><svg class="note-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 4.5h15v10.5h-8L7 19.5v-4.5H4.5z" /></svg><span class="note-tally" data-note-tally aria-hidden="true"></span><span class="sr-only">Add a note to ${label}</span></button>`;
}
